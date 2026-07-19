// Student Quiz Logic
let currentSetId, currentWords = [], currentIndex = 0;
let results = [];
let startTime, wordStartTime;
let studentName = '';

document.addEventListener('DOMContentLoaded', () => {
  const regDiv = document.getElementById('registration');
  const todoDiv = document.getElementById('todo-section');
  const nameInput = document.getElementById('student-name');
  const enterBtn = document.getElementById('enter-btn');

  enterBtn.addEventListener('click', async () => {
    studentName = nameInput.value.trim();
    if (!studentName) return alert('Please enter your name');
    // Fetch published sets and student's completed sets
    const [setsRes, studentRes] = await Promise.all([
      fetch('/api/student/sets'),
      fetch(`/api/student/${encodeURIComponent(studentName)}`)
    ]);
    const sets = await setsRes.json();
    let completed = [];
    if (studentRes.ok) {
      const stu = await studentRes.json();
      completed = stu.completedSets || [];
    }
    const pending = sets.filter(s => !completed.includes(s.id));
    const todoList = document.getElementById('todo-list');
    if (pending.length === 0) {
      todoList.innerHTML = '<p>All assigned quizzes completed! 🎉</p>';
    } else {
      todoList.innerHTML = '<ul class="list">' + pending.map(s => 
        `<li><button class="btn start-quiz-btn" data-id="${s.id}" data-name="${s.name}">${s.name} (${s.count} words)</button></li>`
      ).join('') + '</ul>';
      document.querySelectorAll('.start-quiz-btn').forEach(btn => {
        btn.addEventListener('click', () => startQuiz(btn.dataset.id, btn.dataset.name));
      });
    }
    todoDiv.style.display = 'block';
    nameInput.style.display = 'none';
    enterBtn.style.display = 'none';
  });

  async function startQuiz(setId, setName) {
    currentSetId = setId;
    const res = await fetch(`/api/student/sets/${setId}/words`);
    const data = await res.json();
    currentWords = data.words;
    results = [];
    currentIndex = 0;
    startTime = Date.now();
    document.getElementById('registration').style.display = 'none';
    document.getElementById('quiz-area').style.display = 'block';
    showWord();
  }

  function showWord() {
    if (currentIndex >= currentWords.length) return finishQuiz();
    const word = currentWords[currentIndex];
    wordStartTime = Date.now();

    document.getElementById('step1').style.display = 'block';
    document.getElementById('step2').style.display = 'none';
    document.getElementById('step3').style.display = 'none';
    document.getElementById('quiz-progress').textContent = `Word ${currentIndex+1} / ${currentWords.length}`;

    const questionType = Math.random() < 0.5 ? 'word-to-def' : 'def-to-word';
    const questionDiv = document.getElementById('question-prompt');
    const choicesDiv = document.getElementById('choices');
    choicesDiv.innerHTML = '';

    if (questionType === 'word-to-def') {
      questionDiv.innerHTML = `What is the definition of <strong>${word.word}</strong>?`;
      let options = [word.definition, ...(word.defDistractors || [])];
      options = shuffleArray(options);
      options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'choice-btn';
        btn.textContent = opt;
        btn.addEventListener('click', () => handleChoice(btn, opt === word.definition));
        choicesDiv.appendChild(btn);
      });
    } else {
      questionDiv.innerHTML = `Which word means: <strong>${word.definition}</strong>?`;
      let options = [word.word, ...(word.wordDistractors || [])];
      options = shuffleArray(options);
      options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'choice-btn';
        btn.textContent = opt;
        btn.addEventListener('click', () => handleChoice(btn, opt === word.word));
        choicesDiv.appendChild(btn);
      });
    }
  }

  function handleChoice(btn, isCorrect) {
    const allBtns = document.querySelectorAll('#choices .choice-btn');
    allBtns.forEach(b => b.disabled = true);
    const stayTime = (Date.now() - wordStartTime) / 1000;
    if (isCorrect) {
      btn.classList.add('correct');
      document.getElementById('step1-feedback').textContent = '✓ Correct!';
    } else {
      btn.classList.add('wrong');
      document.getElementById('step1-feedback').textContent = '✗ Incorrect';
      // Highlight correct answer
      allBtns.forEach(b => {
        if (b.textContent === currentWords[currentIndex].definition || b.textContent === currentWords[currentIndex].word) {
          if (!b.classList.contains('correct')) b.classList.add('correct');
        }
      });
    }
    results[currentIndex] = {
      word: currentWords[currentIndex].word,
      definitionCorrect: isCorrect,
      wordStayTime: stayTime
    };
    setTimeout(showStep2, 1200);
  }

  function showStep2() {
    const word = currentWords[currentIndex];
    document.getElementById('step1').style.display = 'none';
    document.getElementById('step2').style.display = 'block';
    document.getElementById('review-word').textContent = word.word;
    document.getElementById('review-def').textContent = word.definition;
    document.getElementById('review-detail').innerHTML = `<p><strong>Detailed:</strong> ${word.detailedDefinition || word.definition}</p>`;
    document.getElementById('review-sentences').innerHTML = word.sentences.map(s => `<li>${s}</li>`).join('');
    // Enable word click
    enableWordClick();
    document.getElementById('next-to-step3').onclick = showStep3;
  }

  function enableWordClick() {
    const clickables = document.querySelectorAll('#review-sentences li, #review-detail p, #review-def');
    clickables.forEach(el => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', async (e) => {
        const selection = window.getSelection().toString().trim();
        if (!selection || selection.split(' ').length > 1) return;
        const popup = document.getElementById('dict-popup');
        popup.style.display = 'none';
        try {
          const res = await fetch(`/api/dictionary/${encodeURIComponent(selection)}`);
          if (!res.ok) throw new Error();
          const data = await res.json();
          const entry = data[0];
          popup.innerHTML = `<strong>${entry.word}</strong> (${entry.meanings[0].partOfSpeech})<br>
            <em>${entry.meanings[0].definitions[0].definition}</em><br>
            <small>Example: ${entry.meanings[0].definitions[0].example || '—'}</small>`;
          popup.style.display = 'block';
          popup.style.left = Math.min(e.clientX, window.innerWidth-310) + 'px';
          popup.style.top = (e.clientY - 40) + 'px';
          setTimeout(() => popup.style.display = 'none', 4000);
        } catch {
          popup.innerHTML = 'Definition not found.';
          popup.style.display = 'block';
          popup.style.left = e.clientX + 'px';
          popup.style.top = (e.clientY - 30) + 'px';
          setTimeout(() => popup.style.display = 'none', 2000);
        }
      });
    });
  }

  function showStep3() {
    const word = currentWords[currentIndex];
    document.getElementById('step2').style.display = 'none';
    document.getElementById('step3').style.display = 'block';
    document.getElementById('fill-sentence').innerHTML = word.fillBlank.replace('______', '<span style="border-bottom:2px dashed #5b7fa5; padding:0 4px;">______</span>');
    document.getElementById('fill-input').value = '';
    document.getElementById('step3-feedback').textContent = '';
    document.getElementById('submit-fill').onclick = () => {
      const userAnswer = document.getElementById('fill-input').value.trim();
      const correctAnswer = word.fillAnswer || word.word;
      const isCorrect = userAnswer.toLowerCase() === correctAnswer.toLowerCase();
      document.getElementById('step3-feedback').textContent = isCorrect ? '✓ Correct!' : `✗ The correct form is "${correctAnswer}"`;
      results[currentIndex].fillBlankCorrect = isCorrect;
      document.getElementById('submit-fill').disabled = true;
      setTimeout(() => {
        currentIndex++;
        document.getElementById('submit-fill').disabled = false;
        showWord();
      }, 1500);
    };
  }

  async function finishQuiz() {
    document.getElementById('quiz-area').style.display = 'none';
    document.getElementById('quiz-complete').style.display = 'block';
    const totalTimeSec = Math.round((Date.now() - startTime) / 1000);
    const totalQ = results.length * 2;
    const correct = results.reduce((s, r) => s + (r.definitionCorrect?1:0) + (r.fillBlankCorrect?1:0), 0);
    document.getElementById('final-accuracy').textContent = Math.round((correct / totalQ) * 100);
    await fetch('/api/quiz-result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentName, setId: currentSetId, results, totalTimeSec })
    });
  }

  function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
});