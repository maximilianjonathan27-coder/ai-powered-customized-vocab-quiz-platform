// Teacher Portal Logic
document.addEventListener('DOMContentLoaded', () => {
  let currentSets = [];
  let charts = {};

  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const panel = tab.dataset.tab;
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.getElementById(`tab-${panel}`).classList.add('active');
      if (panel === 'sets') loadSets();
      if (panel === 'publish') loadPublish();
      if (panel === 'students') loadStudents();
      if (panel === 'report') populateStudentSelect();
      if (panel === 'settings') loadSettings();
    });
  });

  // Add word entry
  document.getElementById('add-word-entry').addEventListener('click', () => {
    const container = document.getElementById('manual-words-container');
    const div = document.createElement('div');
    div.className = 'word-entry';
    div.innerHTML = `
      <input type="text" placeholder="Word" class="word">
      <input type="text" placeholder="Simple definition" class="def">
      <input type="text" placeholder="3 distractors (comma)" class="dist">
      <textarea placeholder="2-3 example sentences" rows="2"></textarea>
      <input type="text" placeholder="Fill‑blank sentence with (base)" class="fill">
      <input type="text" placeholder="Correct grammatical answer" class="fill-answer">
      <input type="text" placeholder="Detailed dictionary definition" class="detail">
    `;
    container.appendChild(div);
  });

  // Save manual set
  document.getElementById('save-manual-set').addEventListener('click', async () => {
    const name = document.getElementById('set-name-manual').value.trim();
    if (!name) return alert('Please enter a set name');
    const entries = document.querySelectorAll('.word-entry');
    const words = [];
    entries.forEach(e => {
      const word = e.querySelector('.word').value.trim();
      if (!word) return;
      words.push({
        word,
        definition: e.querySelector('.def').value.trim(),
        defDistractors: e.querySelector('.dist').value.split(',').map(s => s.trim()).filter(Boolean),
        wordDistractors: [], // manual: leave empty or teacher can add later
        sentences: e.querySelector('textarea').value.split('\n').filter(Boolean),
        fillBlank: e.querySelector('.fill').value.trim(),
        fillAnswer: e.querySelector('.fill-answer').value.trim(),
        detailedDefinition: e.querySelector('.detail').value.trim()
      });
    });
    if (words.length === 0) return alert('No valid words');
    const res = await fetch('/api/sets/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, words })
    });
    if (res.ok) {
      alert('Set created!');
      document.getElementById('set-name-manual').value = '';
      document.getElementById('manual-words-container').innerHTML = `
        <div class="word-entry">
          <input type="text" placeholder="Word" class="word">
          <input type="text" placeholder="Simple definition" class="def">
          <input type="text" placeholder="3 distractors (comma)" class="dist">
          <textarea placeholder="2-3 example sentences" rows="2"></textarea>
          <input type="text" placeholder="Fill‑blank sentence with (base)" class="fill">
          <input type="text" placeholder="Correct grammatical answer" class="fill-answer">
          <input type="text" placeholder="Detailed dictionary definition" class="detail">
        </div>`;
      loadSets();
    } else {
      const err = await res.json();
      alert('Error: ' + err.error);
    }
  });

  // AI Bulk Generate
  document.getElementById('bulk-gen-btn').addEventListener('click', async () => {
    const name = document.getElementById('set-name-ai').value.trim();
    const raw = document.getElementById('word-list').value;
    const words = raw.split(/[\n,]+/).map(w => w.trim()).filter(Boolean);
    if (!name || words.length === 0) return alert('Set name and words required');
    const btn = document.getElementById('bulk-gen-btn');
    btn.disabled = true; btn.textContent = 'Generating...';
    document.getElementById('gen-status').textContent = '';
    try {
      const res = await fetch('/api/sets/bulk-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, words })
      });
      const data = await res.json();
      if (!res.ok) throw data.error;
      document.getElementById('gen-status').textContent = `Set "${name}" created with ${data.count} words.`;
      loadSets();
    } catch (err) {
      document.getElementById('gen-status').textContent = 'Error: ' + (typeof err === 'string' ? err : err.message);
    } finally {
      btn.disabled = false; btn.textContent = 'Generate & Save';
    }
  });

  async function loadSets() {
    const res = await fetch('/api/sets');
    currentSets = await res.json();
    const ul = document.getElementById('sets-list');
    ul.innerHTML = currentSets.map(s => `
      <li>
        <span><strong>${s.name}</strong> (${s.count} words)</span>
        <button class="btn-outline delete-set" data-id="${s.id}" style="padding:0.3rem 0.8rem;">Delete</button>
      </li>
    `).join('');
    document.querySelectorAll('.delete-set').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('Delete this set?')) return;
        await fetch(`/api/sets/${btn.dataset.id}`, { method: 'DELETE' });
        loadSets();
      });
    });
  }

  // Publish
  async function loadPublish() {
    const div = document.getElementById('publish-checkboxes');
    let all = [];
    let published = [];
    try {
      const [allRes, pubRes] = await Promise.all([
        fetch('/api/sets'),
        fetch('/api/settings/published')
      ]);
      if (!allRes.ok || !pubRes.ok) throw new Error('Failed to load publish data');
      const allData = await allRes.json();
      const pubData = await pubRes.json();
      all = Array.isArray(allData) ? allData : [];
      published = Array.isArray(pubData) ? pubData : [];
    } catch (err) {
      div.innerHTML = '<p class="error">Failed to load sets. Please try again.</p>';
      return;
    }

    // Normalize published IDs to strings so comparisons against checkbox values (always strings) work correctly
    const publishedIds = published.map(id => String(id));

    if (all.length === 0) {
      div.innerHTML = '<p>No sets available to publish yet.</p>';
      return;
    }

    div.innerHTML = all.map(s => {
      const id = String(s.id);
      const isChecked = publishedIds.includes(id);
      return `
      <label class="checkbox-item">
        <input type="checkbox" value="${id}" ${isChecked ? 'checked' : ''}>
        ${s.name} (${s.count} words)
      </label><br>
    `;
    }).join('');
  }

  document.getElementById('save-publish').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const statusEl = document.getElementById('publish-status');
    const checkboxes = document.querySelectorAll('#publish-checkboxes input[type="checkbox"]');
    const ids = Array.from(checkboxes)
      .filter(c => c.checked)
      .map(c => c.value);

    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = 'Saving...';
    if (statusEl) statusEl.textContent = '';

    try {
      const res = await fetch('/api/settings/publish/bulk', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publishedSets: ids })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update published sets');
      }
      if (statusEl) {
        statusEl.textContent = 'Published sets updated successfully.';
        statusEl.classList.remove('error');
        statusEl.classList.add('success');
      } else {
        alert('Published sets updated.');
      }
    } catch (err) {
      if (statusEl) {
        statusEl.textContent = 'Error: ' + err.message;
        statusEl.classList.remove('success');
        statusEl.classList.add('error');
      } else {
        alert('Error: ' + err.message);
      }
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });

  // Students Overview
  async function loadStudents() {
    const res = await fetch('/api/students');
    const students = await res.json();
    const tbody = document.querySelector('#students-table tbody');
    tbody.innerHTML = students.map(s => `
      <tr>
        <td>${s.name}</td><td>${s.accuracy}%</td><td>${Math.round(s.totalTime/60)}</td><td>${s.completedQuizzes}</td><td>${s.masteredWords}</td>
      </tr>
    `).join('');
  }

  // Parent Report
  async function populateStudentSelect() {
    const res = await fetch('/api/students');
    const students = await res.json();
    const select = document.getElementById('student-select');
    select.innerHTML = '<option value="">-- Choose --</option>' + 
      students.map(s => `<option>${s.name}</option>`).join('');
  }
  document.getElementById('gen-report-btn').addEventListener('click', async () => {
    const name = document.getElementById('student-select').value;
    if (!name) return alert('Select a student');
    const container = document.getElementById('report-container');
    container.style.display = 'none';
    try {
      const res = await fetch(`/api/report/${encodeURIComponent(name)}`);
      if (!res.ok) throw (await res.json()).error;
      const data = await res.json();
      renderReport(data);
      container.style.display = 'block';
    } catch (e) { alert('Error: ' + e); }
  });

  function renderReport(data) {
    document.getElementById('report-name').textContent = `Report: ${data.name}`;
    document.getElementById('metric-cards').innerHTML = `
      <div class="metric"><div class="value">${data.overallAccuracy}%</div>Accuracy</div>
      <div class="metric"><div class="value">${Math.round(data.totalTime/60)} min</div>Total Time</div>
      <div class="metric"><div class="value">${data.completedQuizzes}</div>Quizzes</div>
      <div class="metric"><div class="value">${data.masteredCount}</div>Mastered</div>
      <div class="metric"><div class="value">${data.avgStay}s</div>Avg Time/Word</div>
    `;
    destroyCharts();
    const trendCtx = document.getElementById('trendChart').getContext('2d');
    charts.trend = new Chart(trendCtx, {
      type: 'line',
      data: {
        labels: data.dailyLabels,
        datasets: [{ label: 'Daily Accuracy %', data: data.dailyAccuracy, borderColor: '#5b7fa5', tension: 0.3 }]
      },
      options: { responsive: true, plugins: { title: { display: true, text: 'Daily Accuracy Trend' } } }
    });
    const pieCtx = document.getElementById('pieChart').getContext('2d');
    charts.pie = new Chart(pieCtx, {
      type: 'pie',
      data: {
        labels: ['Definition Errors', 'Fill‑Blank Errors'],
        datasets: [{ data: [data.errorPie.definitionErrors, data.errorPie.fillBlankErrors], backgroundColor: ['#f59e0b','#ef4444'] }]
      },
      options: { responsive: true, plugins: { title: { display: true, text: 'Latest Quiz Errors' } } }
    });
    const barCtx = document.getElementById('masteryBarChart').getContext('2d');
    charts.bar = new Chart(barCtx, {
      type: 'bar',
      data: {
        labels: ['Fully Mastered', 'Need Consolidation', 'Weak'],
        datasets: [{ data: [data.mastery.fullyMastered, data.mastery.needConsolidation, data.mastery.weak], backgroundColor: ['#22c55e','#f59e0b','#ef4444'] }]
      },
      options: { responsive: true, plugins: { title: { display: true, text: 'Mastery Distribution' } } }
    });
    document.getElementById('advice-box').innerHTML = `<strong>Personalized Advice:</strong> ${data.advice}`;
  }

  function destroyCharts() {
    Object.values(charts).forEach(chart => chart.destroy());
    charts = {};
  }

  document.getElementById('export-pdf').addEventListener('click', () => {
    const el = document.getElementById('report-container');
    html2pdf().set({ margin: 0.5, filename: 'student-report.pdf', html2canvas: { scale: 2 } }).from(el).save();
  });
  document.getElementById('copy-link').addEventListener('click', () => {
    const name = document.getElementById('student-select').value;
    if (!name) return;
    const link = `${window.location.origin}/report?student=${encodeURIComponent(name)}`;
    navigator.clipboard.writeText(link).then(() => alert('Link copied!'));
  });

  // Settings
  async function loadSettings() {
    const res = await fetch('/api/settings');
    const s = await res.json();
    document.getElementById('api-key-input').value = s.apiKey;
    document.getElementById('gen-count').textContent = s.generationCount;
  }
  document.getElementById('save-settings').addEventListener('click', async () => {
    const apiKey = document.getElementById('api-key-input').value.trim();
    if (!apiKey) return alert('Enter API key');
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey })
    });
    alert('Saved');
  });

  // Init
  loadSets();
  loadSettings();
});