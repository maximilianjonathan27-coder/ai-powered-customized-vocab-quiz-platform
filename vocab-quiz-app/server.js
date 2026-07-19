const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_DIR = path.join(__dirname, 'data');
const SETS_FILE = path.join(DATA_DIR, 'vocab_sets.json');
const STUDENTS_FILE = path.join(DATA_DIR, 'students.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// Initialize data directory and files
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SETS_FILE)) fs.writeFileSync(SETS_FILE, '[]', 'utf8');
if (!fs.existsSync(STUDENTS_FILE)) fs.writeFileSync(STUDENTS_FILE, '[]', 'utf8');
if (!fs.existsSync(SETTINGS_FILE)) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify({
    apiKey: 'sk-05954a7b270e42d682b3b7446e5e865c',
    generationCount: 0,
    publishedSets: []
  }, null, 2), 'utf8');
}

function readJSON(f) { return JSON.parse(fs.readFileSync(f, 'utf8')); }
function writeJSON(f, d) { fs.writeFileSync(f, JSON.stringify(d, null, 2), 'utf8'); }

// ---------- Dictionary Proxy ----------
app.get('/api/dictionary/:word', async (req, res) => {
  try {
    const word = encodeURIComponent(req.params.word);
    const resp = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`, { timeout: 5000 });
    res.json(resp.data);
  } catch (e) {
    res.status(404).json({ error: 'Word not found' });
  }
});

// ---------- Sets CRUD ----------
app.get('/api/sets', (req, res) => {
  const sets = readJSON(SETS_FILE);
  res.json(sets.map(s => ({ id: s.id, name: s.name, count: s.words.length, createdAt: s.createdAt })));
});

app.get('/api/sets/:id', (req, res) => {
  const sets = readJSON(SETS_FILE);
  const set = sets.find(s => s.id === req.params.id);
  if (!set) return res.status(404).json({ error: 'Set not found' });
  res.json(set);
});

app.post('/api/sets/manual', (req, res) => {
  try {
    const { name, words } = req.body;
    if (!name || !Array.isArray(words) || words.length === 0) 
      return res.status(400).json({ error: 'Invalid data' });
    const sets = readJSON(SETS_FILE);
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    sets.push({ id, name, createdAt: new Date().toISOString(), words });
    writeJSON(SETS_FILE, sets);
    res.json({ id, name });
  } catch (e) { res.status(500).json({ error: 'Failed to create set' }); }
});

app.delete('/api/sets/:id', (req, res) => {
  let sets = readJSON(SETS_FILE);
  const lenBefore = sets.length;
  sets = sets.filter(s => s.id !== req.params.id);
  if (sets.length === lenBefore) return res.status(404).json({ error: 'Not found' });
  writeJSON(SETS_FILE, sets);
  res.json({ success: true });
});

// ---------- AI Bulk Generate ----------
app.post('/api/sets/bulk-generate', async (req, res) => {
  try {
    const { name, words: rawWords } = req.body;
    if (!name || !Array.isArray(rawWords) || rawWords.length === 0)
      return res.status(400).json({ error: 'Invalid data' });

    const settings = readJSON(SETTINGS_FILE);
    if (!settings.apiKey) throw new Error('API key not configured');

    const prompt = `Generate a vocabulary quiz set for these words: ${JSON.stringify(rawWords)}.
For each word, create a JSON object with:
- "word": the word itself
- "definition": a clear, simple English definition (10 words max, basic vocabulary)
- "defDistractors": an array of 3 incorrect definitions, each also in simple English, and each having a length nearly equal to the correct definition (±2 words). They must sound plausible but be clearly wrong; avoid obvious giveaways.
- "wordDistractors": an array of 3 incorrect words that are similar in spelling, sound, or meaning to the target word, making it harder to guess. Do not use obscure words; they should be common English words that students could confuse.
- "sentences": 2 natural example sentences.
- "fillBlank": a sentence with a blank "______" and the word's BASE form in parentheses right after the blank (e.g., "She ______ (go) to school every day."). The student must fill the blank with the CORRECT grammatical form (tense, plural, etc.). The correct answer must be provided as "fillAnswer".
- "detailedDefinition": a more thorough dictionary definition, including part of speech and usage (1-2 sentences).

Return ONLY a JSON array. No extra text.`;

    const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 8000,
    }, {
      headers: { 'Authorization': `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json' },
      timeout: 60000,
    });

    let content = response.data.choices[0].message.content.trim();
    if (content.startsWith('```json')) content = content.slice(7, -3).trim();
    else if (content.startsWith('```')) content = content.slice(3, -3).trim();
    const generatedWords = JSON.parse(content);
    if (!Array.isArray(generatedWords)) throw new Error('Response is not an array');

    const sets = readJSON(SETS_FILE);
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2,6);
    sets.push({ id, name, createdAt: new Date().toISOString(), words: generatedWords });
    writeJSON(SETS_FILE, sets);

    settings.generationCount += 1;
    writeJSON(SETTINGS_FILE, settings);

    res.json({ id, name, count: generatedWords.length });
  } catch (e) {
    console.error(e);
    if (e.response?.status === 401) return res.status(401).json({ error: 'Invalid API key' });
    if (e.response?.status === 429) return res.status(429).json({ error: 'Quota exceeded' });
    if (e.code === 'ECONNABORTED') return res.status(504).json({ error: 'AI timeout' });
    res.status(500).json({ error: e.message });
  }
});

// ---------- Publish management ----------
app.get('/api/settings/published', (req, res) => {
  const settings = readJSON(SETTINGS_FILE);
  res.json(settings.publishedSets || []);
});

app.put('/api/settings/publish/bulk', (req, res) => {
  const { publishedSets } = req.body;
  if (!Array.isArray(publishedSets)) return res.status(400).json({ error: 'Invalid format' });
  const settings = readJSON(SETTINGS_FILE);
  settings.publishedSets = publishedSets;
  writeJSON(SETTINGS_FILE, settings);
  res.json({ success: true });
});

// ---------- Student Portal (published sets) ----------
app.get('/api/student/sets', (req, res) => {
  const settings = readJSON(SETTINGS_FILE);
  const publishedIds = settings.publishedSets || [];
  const allSets = readJSON(SETS_FILE);
  const published = allSets.filter(s => publishedIds.includes(s.id));
  res.json(published.map(s => ({ id: s.id, name: s.name, count: s.words.length })));
});

app.get('/api/student/sets/:id/words', (req, res) => {
  const sets = readJSON(SETS_FILE);
  const set = sets.find(s => s.id === req.params.id);
  if (!set) return res.status(404).json({ error: 'Set not found' });
  const words = [...set.words];
  // Shuffle
  for (let i = words.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [words[i], words[j]] = [words[j], words[i]];
  }
  res.json({ id: set.id, name: set.name, words });
});

// ---------- Student management & quiz result ----------
function getStudent(name) {
  const students = readJSON(STUDENTS_FILE);
  return students.find(s => s.nameLower === name.toLowerCase());
}
function saveStudent(student) {
  let students = readJSON(STUDENTS_FILE);
  const idx = students.findIndex(s => s.nameLower === student.nameLower);
  if (idx >= 0) students[idx] = student;
  else students.push(student);
  writeJSON(STUDENTS_FILE, students);
}

app.get('/api/students', (req, res) => {
  const students = readJSON(STUDENTS_FILE);
  res.json(students.map(s => ({
    name: s.name,
    accuracy: s.totalQuestions > 0 ? Math.round((s.totalCorrect / s.totalQuestions) * 100) : 0,
    totalTime: s.totalTime,
    completedQuizzes: s.completedQuizzes,
    masteredWords: s.masteredWords.length
  })));
});

app.get('/api/student/:name', (req, res) => {
  const student = getStudent(req.params.name);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  res.json(student);
});

app.post('/api/quiz-result', (req, res) => {
  try {
    const { studentName, setId, results, totalTimeSec } = req.body;
    if (!studentName || !setId || !Array.isArray(results) || results.length === 0)
      return res.status(400).json({ error: 'Missing data' });

    let student = getStudent(studentName);
    if (!student) {
      student = {
        name: studentName,
        nameLower: studentName.toLowerCase(),
        totalQuestions: 0,
        totalCorrect: 0,
        totalTime: 0,
        completedQuizzes: 0,
        masteredWords: [],
        attemptedWords: [],
        quizHistory: [],
        completedSets: [],
        dailyStats: {},
      };
    }

    let correct = 0, defErrs = 0, fillErrs = 0;
    const newlyMastered = [];
    const today = new Date().toISOString().slice(0,10);
    if (!student.dailyStats) student.dailyStats = {};
    if (!student.dailyStats[today]) student.dailyStats[today] = { time: 0, correct: 0, total: 0 };

    results.forEach(r => {
      if (r.definitionCorrect) correct++; else defErrs++;
      if (r.fillBlankCorrect) correct++; else fillErrs++;
      const wLower = r.word.toLowerCase();
      if (!student.attemptedWords.includes(wLower)) student.attemptedWords.push(wLower);
      if (r.definitionCorrect && r.fillBlankCorrect && !student.masteredWords.includes(wLower)) {
        student.masteredWords.push(wLower);
        newlyMastered.push(r.word);
      }
      // Store per-word stay time (optional)
      if (r.wordStayTime) {
        student[`stay_${wLower}`] = (student[`stay_${wLower}`] || 0) + r.wordStayTime;
      }
    });

    student.totalQuestions += results.length * 2;
    student.totalCorrect += correct;
    student.totalTime += totalTimeSec;
    student.completedQuizzes += 1;
    student.dailyStats[today].time += totalTimeSec;
    student.dailyStats[today].correct += correct;
    student.dailyStats[today].total += results.length * 2;

    student.quizHistory.push({
      date: new Date().toISOString(),
      setId,
      accuracy: Math.round((correct / (results.length * 2)) * 100),
      definitionErrors: defErrs,
      fillBlankErrors: fillErrs,
      masteredGained: newlyMastered,
    });

    if (!student.completedSets.includes(setId)) student.completedSets.push(setId);
    saveStudent(student);

    res.json({ message: 'Result saved', accuracy: student.quizHistory.slice(-1)[0].accuracy });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to save result' });
  }
});

// ---------- Parent Report (enhanced) ----------
app.get('/api/report/:name', (req, res) => {
  try {
    const student = getStudent(req.params.name);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const overallAccuracy = student.totalQuestions > 0
      ? Math.round((student.totalCorrect / student.totalQuestions) * 100) : 0;
    const totalTime = student.totalTime;
    const completedQuizzes = student.completedQuizzes;
    const masteredCount = student.masteredWords.length;

    // Average word stay time
    const stayKeys = Object.keys(student).filter(k => k.startsWith('stay_'));
    const avgStay = stayKeys.length > 0
      ? (stayKeys.reduce((s,k) => s + student[k], 0) / stayKeys.length).toFixed(1)
      : '0.0';

    // Daily accuracy trend (last 14 days)
    const dailyEntries = Object.entries(student.dailyStats || {}).sort();
    const recentDays = dailyEntries.slice(-14);
    const dailyLabels = recentDays.map(e => e[0]);
    const dailyAccuracy = recentDays.map(e => {
      const d = e[1];
      return d.total > 0 ? Math.round((d.correct / d.total) * 100) : 0;
    });

    // Latest quiz errors
    const latest = student.quizHistory.length ? student.quizHistory[student.quizHistory.length-1] : null;
    const errorPie = latest 
      ? { definitionErrors: latest.definitionErrors, fillBlankErrors: latest.fillBlankErrors }
      : { definitionErrors: 0, fillBlankErrors: 0 };

    // Mastery breakdown (all unique words from all sets)
    const allSets = readJSON(SETS_FILE);
    const uniqueWords = new Set();
    allSets.forEach(s => s.words.forEach(w => uniqueWords.add(w.word.toLowerCase())));
    const totalUnique = uniqueWords.size;
    const fullyMastered = student.masteredWords.length;
    const needConsolidation = student.attemptedWords.filter(w => !student.masteredWords.includes(w)).length;
    const weak = Math.max(0, totalUnique - fullyMastered - needConsolidation);

    // Advice
    let advice = '';
    if (overallAccuracy < 60) advice += 'Focus on word meanings. Review the detailed definitions after each question. ';
    else if (overallAccuracy < 80) advice += 'Good progress! Pay extra attention to grammar fill-in-the-blanks. ';
    else advice += 'Excellent mastery! Keep challenging yourself. ';
    if (student.completedSets.length < 2) advice += 'Try completing more quiz sets to build consistency.';

    res.json({
      name: student.name,
      overallAccuracy,
      totalTime,
      completedQuizzes,
      masteredCount,
      avgStay,
      dailyLabels,
      dailyAccuracy,
      errorPie,
      mastery: { fullyMastered, needConsolidation, weak },
      advice
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Report generation failed' });
  }
});

// ---------- Settings ----------
app.get('/api/settings', (req, res) => res.json(readJSON(SETTINGS_FILE)));
app.put('/api/settings', (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey) return res.status(400).json({ error: 'API key required' });
    const settings = readJSON(SETTINGS_FILE);
    settings.apiKey = apiKey;
    writeJSON(SETTINGS_FILE, settings);
    res.json({ message: 'Updated' });
  } catch (e) { res.status(500).json({ error: 'Update failed' }); }
});

// Redirect root
app.get('/', (req, res) => res.redirect('/quiz'));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));