document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('view-report-btn').addEventListener('click', async () => {
    const name = document.getElementById('parent-student-name').value.trim();
    if (!name) return alert('Please enter student name');
    const errorDiv = document.getElementById('error-msg');
    errorDiv.style.display = 'none';
    try {
      const res = await fetch(`/api/report/${encodeURIComponent(name)}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Student not found');
      }
      const data = await res.json();
      renderReport(data);
      document.getElementById('auth-card').style.display = 'none';
      document.getElementById('report-content').style.display = 'block';
    } catch (e) {
      errorDiv.textContent = e.message;
      errorDiv.style.display = 'block';
    }
  });
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
  // Trend
  new Chart(document.getElementById('trendChart'), {
    type: 'line',
    data: {
      labels: data.dailyLabels,
      datasets: [{ label: 'Accuracy %', data: data.dailyAccuracy, borderColor: '#5b7fa5', tension: 0.3 }]
    },
    options: { responsive: true, plugins: { title: { display: true, text: 'Daily Accuracy Trend' } } }
  });
  // Pie
  new Chart(document.getElementById('pieChart'), {
    type: 'pie',
    data: {
      labels: ['Definition Errors', 'Fill‑Blank Errors'],
      datasets: [{ data: [data.errorPie.definitionErrors, data.errorPie.fillBlankErrors], backgroundColor: ['#f59e0b','#ef4444'] }]
    },
    options: { responsive: true, plugins: { title: { display: true, text: 'Latest Quiz Errors' } } }
  });
  // Mastery bar
  new Chart(document.getElementById('masteryBarChart'), {
    type: 'bar',
    data: {
      labels: ['Fully Mastered', 'Need Consolidation', 'Weak'],
      datasets: [{ data: [data.mastery.fullyMastered, data.mastery.needConsolidation, data.mastery.weak], backgroundColor: ['#22c55e','#f59e0b','#ef4444'] }]
    },
    options: { responsive: true, plugins: { title: { display: true, text: 'Vocabulary Mastery' } } }
  });
  document.getElementById('advice-box').innerHTML = `<strong>Advice:</strong> ${data.advice}`;
}