// populateQuestions.js  (full rewrite)
// Assumptions: master syllabus JSON at ../js/mastersyllabustopic.json
//              questions repo JSON at ../js/pyqrepository.json
// Exposes: getSelectedQuestions() -> Array of selected question objects (use in PDF generator)

let masterSyllabus = [];
let questionsRepo = [];
let currentMode = "year-gs"; // default
const selectionMap = new Map(); // key: question_id, value: true/false
let customQuestions = [];
let customCounter = 1;

// DOM refs
const filtersDiv = document.getElementById("filters");
const tbody = document.querySelector("#questionsTable tbody");
const selectAllCheckbox = document.getElementById("selectAll");
const summaryDiv = document.getElementById("selectedSummary");
const selectedCountSpan = document.getElementById("selectedCount");
const totalMarksSpan = document.getElementById("totalMarks");
const count10Span = document.getElementById("count10");
const count15Span = document.getElementById("count15");

// load JSONs and init
(async function init() {
  try {
    const msResp = await fetch('./js/mastersyllabustopic.json');
    masterSyllabus = await msResp.json();

    const qResp = await fetch('./js/pyqrepository.json');
    questionsRepo = await qResp.json();

    // sanity: ensure arrays exist
    if (!masterSyllabus || !masterSyllabus.official_syllabus_topics) {
      console.error("masterSyllabus missing or malformed");
      masterSyllabus = { official_syllabus_topics: [] };
    }
    if (!questionsRepo || !questionsRepo.questions_repository) {
      console.error("questionsRepo missing or malformed");
      questionsRepo = { questions_repository: [] };
    }

    wireModeToggle();
    setupFilters(); // initial UI for default mode
    updateSummary(); // initial summary (zero)
  } catch (err) {
    console.error("Error loading JSON files:", err);
    alert("Failed to load JSON files. Check console for details.");
  }
})();

// ---------------------- Helpers ----------------------
function resetSummaryUI() {
  summaryDiv.style.display = "none";
  selectedCountSpan.textContent = "0";
  totalMarksSpan.textContent = "0";
  count10Span.textContent = "0";
  count15Span.textContent = "0";
}

function wireModeToggle() {
  const radios = document.querySelectorAll("input[name='mode']");
  radios.forEach(r => r.addEventListener("change", e => {
    currentMode = e.target.value;
    // clear table UI but keep selectionMap (persist)
    tbody.innerHTML = "";
    selectAllCheckbox.checked = false;
    setupFilters();
  }));
}

// build a map for quick question lookup by id
function questionLookupMap() {
    const m = new Map();

    questionsRepo.questions_repository.forEach(q =>
        m.set(q.question_id, q)
    );

    customQuestions.forEach(q =>
        m.set(q.question_id, q)
    );

    return m;
}

// Return array of currently selected question objects (ordered by selection insertion)
function getSelectedQuestions() {

    const lookup = questionLookupMap();
    const arr = [];

    for (const [qid, sel] of selectionMap.entries()) {

        if (sel && lookup.has(qid))
            arr.push(lookup.get(qid));

    }

    return arr;
}

// ---------------------- Filters UI ----------------------
function setupFilters() {
  filtersDiv.innerHTML = "";
  resetSummaryUI();
  tbody.innerHTML = "";
  selectAllCheckbox.checked = false;

  if (currentMode === "year-gs") {
filtersDiv.innerHTML = `
<select id="yearFilter">
<option value="">-- Select Year --</option>
</select>

<select id="gsPaperFilter">
<option value="">-- Select GS Paper --</option>
</select>

<button id="addCustomBtn" type="button">
Add your Own
</button>
`;

    const yearFilter = document.getElementById("yearFilter");
    const gsPaperFilter = document.getElementById("gsPaperFilter");

    // populate values (sorted)
    const years = Array.from(new Set(questionsRepo.questions_repository.map(q => q.year))).sort((a,b)=>a-b);
    const gsPapers = Array.from(new Set(questionsRepo.questions_repository.map(q => q.gs_paper)));

    years.forEach(y => yearFilter.add(new Option(y, y)));
    gsPapers.forEach(g => gsPaperFilter.add(new Option(g, g)));

    yearFilter.addEventListener("change", populateTable);
    gsPaperFilter.addEventListener("change", populateTable);

  } else { // gs-syllabus
filtersDiv.innerHTML = `
<select id="gsPaperFilter2">
<option value="">-- Select GS Paper --</option>
</select>

<select id="syllabusFilter">
<option value="">-- Select Syllabus Topic --</option>
</select>

<button id="addCustomBtn" type="button">
Add your Own
</button>
`;

    const gsPaperFilter2 = document.getElementById("gsPaperFilter2");
    const syllabusFilter = document.getElementById("syllabusFilter");

    const gsPapers = Array.from(new Set(questionsRepo.questions_repository.map(q => q.gs_paper)));
    gsPapers.forEach(g => gsPaperFilter2.add(new Option(g, g)));

    // when GS paper changes -> update syllabus options (ordered by masterSyllabus)
    gsPaperFilter2.addEventListener("change", () => {
      populateSyllabusOptions(gsPaperFilter2.value);
      populateTable(); // in case user expects immediate table update when GS paper alone chosen
    });

    // when a syllabus topic chosen -> populate table
    syllabusFilter.addEventListener("change", populateTable);
  }

document
.getElementById("addCustomBtn")
.onclick=()=>{

    const panel=document.getElementById("customQuestionPanel");

    panel.style.display=
        panel.style.display==="none"
        ?"block"
        :"none";

          hideYearGSColumns();

};

document
.getElementById("addCustomQuestions")
.onclick=()=>{

    const ten=
        Number(document.getElementById("custom10").value);

    const fifteen=
        Number(document.getElementById("custom15").value);

    const twenty=
        Number(document.getElementById("custom20").value);

    addCustomQuestions(10,ten);
    addCustomQuestions(15,fifteen);
    addCustomQuestions(20,twenty);

    document.getElementById("custom10").value=0;
    document.getElementById("custom15").value=0;
    document.getElementById("custom20").value=0;

};

}


// populate syllabus select keeping master syllabus order and only topics that are used by questions for that GS
function populateSyllabusOptions(gsVal) {
  const syllabusFilter = document.getElementById("syllabusFilter");
  if (!syllabusFilter) return;
  syllabusFilter.innerHTML = "<option value=''>-- Select Syllabus Topic --</option>";
  if (!gsVal) return;

  const masterArr = masterSyllabus.official_syllabus_topics || [];
  // preserve master order and include only topics that appear in questionsRepo for this GS paper
  const usedTopicSet = new Set(
    questionsRepo.questions_repository
      .filter(q => q.gs_paper === gsVal)
      .flatMap(q => q.official_syllabus_topics || [])
  );

  masterArr.forEach(topic => {
    if (topic.gs_paper === gsVal && usedTopicSet.has(topic.id)) {
      // use full description as option text (per your requirement)
      syllabusFilter.add(new Option(topic.description, topic.id));
    }
  });
}

// ---------------------- Table population & selection logic ----------------------
function populateTable() {

  tbody.innerHTML = ""; // clear only the visible rows
  // Do NOT clear selectionMap here (we are persisting selections across filters)

  // Determine filter values and enforce "at least one selected" requirement
  if (currentMode === "year-gs") {
    const yearFilter = document.getElementById("yearFilter");
    const gsPaperFilter = document.getElementById("gsPaperFilter");
    const yearVal = yearFilter ? yearFilter.value : "";
    const gsVal = gsPaperFilter ? gsPaperFilter.value : "";
    if (!yearVal && !gsVal) {
      // nothing selected -> do not populate
      updateSelectAllState();
      updateSummary(); 
      return;
    }

    // Filter questions in original repo order
    const filtered = questionsRepo.questions_repository.filter(q =>
      (yearVal ? q.year == yearVal : true) &&
      (gsVal ? q.gs_paper == gsVal : true)
    );

    buildTableRows(filtered);
  } else { // gs-syllabus
    const gsPaperFilter2 = document.getElementById("gsPaperFilter2");
    const syllabusFilter = document.getElementById("syllabusFilter");
    const gsVal = gsPaperFilter2 ? gsPaperFilter2.value : "";
    const syllabusVal = syllabusFilter ? syllabusFilter.value : "";
    if (!gsVal && !syllabusVal) {
      updateSelectAllState();
      updateSummary();
      return;
    }

    const filtered = questionsRepo.questions_repository.filter(q =>
      (gsVal ? q.gs_paper == gsVal : true) &&
      (syllabusVal ? (q.official_syllabus_topics || []).includes(syllabusVal) : true)
    );

    buildTableRows(filtered);
  }
}

// build rows using createElement (never mix innerHTML after adding nodes)
function buildTableRows(questionList) {
  // keep order as in questionList
  questionList.forEach(q => {
    const tr = document.createElement("tr");

    // Checkbox cell
    const tdCheckbox = document.createElement("td");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.dataset.qid = q.question_id;

    // set initial checked state from selectionMap (persisted across filters)
    if (selectionMap.get(q.question_id)) {
      cb.checked = true;
      tr.classList.add("selected");
    }

    // when user toggles checkbox: update selectionMap & UI
    cb.addEventListener("change", (e) => {
      const checked = e.target.checked;
      selectionMap.set(q.question_id, checked);
      if (checked) tr.classList.add("selected"); else tr.classList.remove("selected");
      updateSummary();
      updateSelectAllState(); // reflect any change in select-all checkbox
    });

    tdCheckbox.appendChild(cb);
    tr.appendChild(tdCheckbox);

    // Year cell
    const tdYear = document.createElement("td");
    tdYear.textContent = q.year;
    tr.appendChild(tdYear);

    // GS Paper
    const tdGS = document.createElement("td");
    tdGS.textContent = q.gs_paper;
    tr.appendChild(tdGS);

    // Question text
    const tdText = document.createElement("td");
    tdText.textContent = q.question_text;
    tr.appendChild(tdText);

    // Marks
    const tdMarks = document.createElement("td");
    tdMarks.textContent = q.marks;
    tr.appendChild(tdMarks);

    // Word limit
    const tdWord = document.createElement("td");
    tdWord.textContent = q.word_limit;
    tr.appendChild(tdWord);

    tbody.appendChild(tr);
  });

  // After building rows, make sure selectAll checkbox reflects visible state
  updateSelectAllState();
  updateSummary();
}

// update selectAll checkbox state based on visible checkboxes
function updateSelectAllState() {
  const visibleCbs = Array.from(tbody.querySelectorAll("input[type='checkbox']"));
  if (visibleCbs.length === 0) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
    return;
  }
  const checkedCount = visibleCbs.filter(cb => cb.checked).length;
  if (checkedCount === 0) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
  } else if (checkedCount === visibleCbs.length) {
    selectAllCheckbox.checked = true;
    selectAllCheckbox.indeterminate = false;
  } else {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = true;
  }
}

// Select-all toggles only visible checkboxes and updates selectionMap accordingly
selectAllCheckbox.addEventListener("change", function () {
  const visibleRows = Array.from(tbody.querySelectorAll("tr"));
  const checked = this.checked;
  visibleRows.forEach(tr => {
    const cb = tr.querySelector("input[type='checkbox']");
    if (!cb) return;
    cb.checked = checked;
    const qid = cb.dataset.qid;
    selectionMap.set(qid, checked);
    if (checked) tr.classList.add("selected"); else tr.classList.remove("selected");
  });
  updateSummary();
  // ensure indeterminate cleared
  selectAllCheckbox.indeterminate = false;
});

// update summary across ALL selected items (not just visible) — user likely wants global counts
function updateSummary() {
  // Build quick lookup from questionsRepo
const lookup = questionLookupMap();

  let totalSelected = 0;
  let totalMarks = 0;
  let count10 = 0;
  let count15 = 0;

  for (const [qid, sel] of selectionMap.entries()) {
    if (!sel) continue;
    const q = lookup.get(qid);
    if (!q) continue; // skip if question not found
    totalSelected += 1;
    const marks = Number(q.marks) || 0;
    totalMarks += marks;
    if (marks === 10) count10++;
    if (marks === 15) count15++;
  }

  // update UI
  summaryDiv.style.display = totalSelected > 0 ? "block" : "none";
  selectedCountSpan.textContent = String(totalSelected);
  totalMarksSpan.textContent = String(totalMarks);
  count10Span.textContent = String(count10);
  count15Span.textContent = String(count15);
}

// expose helper for PDF generator to get the selected questions in the repo's original order
function getSelectedQuestionsOrdered() {

    const selected=[];

    questionsRepo.questions_repository.forEach(q=>{

        if(selectionMap.get(q.question_id))
            selected.push(q);

    });

    customQuestions.forEach(q=>{

        if(selectionMap.get(q.question_id))
            selected.push(q);

    });

    return selected;

}


function showCustomQuestionDialog() {

    const ten =
        parseInt(prompt("Number of 10 Mark questions", "0")) || 0;

    const fifteen =
        parseInt(prompt("Number of 15 Mark questions", "0")) || 0;

    const twenty =
        parseInt(prompt("Number of 20 Mark questions", "0")) || 0;

    addCustomQuestions(10, ten);
    addCustomQuestions(15, fifteen);
    addCustomQuestions(20, twenty);

}


function addCustomQuestions(marks, count) {

    const wordLimit =
        marks == 10 ? 150 :
        marks == 15 ? 250 :
        300;

    for(let i=0;i<count;i++){

        const q = {

            question_id:
                "CUSTOM_" + customCounter,

            question_text: "",

            year: "",

            marks: marks,

            word_limit: wordLimit,

            gs_paper: "",

            official_syllabus_topics: []

        };

        customCounter++;

        customQuestions.push(q);

        selectionMap.set(q.question_id,true);

        appendCustomRow(q);

    }

    updateSummary();

}

function appendCustomRow(q){

    const tr=document.createElement("tr");

    tr.classList.add("selected");

    // Checkbox

    const td0=document.createElement("td");

    const cb=document.createElement("input");

    cb.type="checkbox";

    cb.checked=true;

    cb.dataset.qid=q.question_id;

    cb.onchange=()=>{

        selectionMap.set(q.question_id,cb.checked);

        tr.classList.toggle("selected",cb.checked);

        updateSummary();

        updateSelectAllState();

    };

    td0.appendChild(cb);

    tr.appendChild(td0);

    // Year
// Empty placeholders for hidden Year and GS
// Year
const td1 = document.createElement("td");
td1.textContent = "-";
tr.appendChild(td1);

// GS Paper
const td2 = document.createElement("td");
td2.textContent = "-";
tr.appendChild(td2);

// Question
const td3 = document.createElement("td");

const ta = document.createElement("textarea");

ta.rows = 3;

ta.style.width = "98%";

ta.value = q.question_text;

    ta.oninput=()=>{

        q.question_text=ta.value;

    };

    td3.appendChild(ta);

    tr.appendChild(td3);

    // Marks

    const td4=document.createElement("td");

    td4.textContent=q.marks;

    tr.appendChild(td4);

    // Word Limit

    const td5=document.createElement("td");

    td5.textContent=q.word_limit;

    tr.appendChild(td5);

    tbody.appendChild(tr);

}


document.getElementById("importMarkdown")
.addEventListener("click", () => {

    document
        .getElementById("importMarkdownFile")
        .click();

});

document
.getElementById("importMarkdownFile")
.addEventListener("change", importMarkdownFile);

// expose to global so generatePDF.js can call it
window.getSelectedQuestions = getSelectedQuestionsOrdered;

// ---------------------- End of script ----------------------

document.getElementById("resetQuestions").addEventListener("click", () => {

    if (!confirm("Remove all selected and custom questions?"))
        return;

    selectionMap.clear();

    customQuestions = [];
    customCounter = 1;

    document.getElementById("customQuestionPanel").style.display = "none";

    setupFilters();

    updateSummary();

});

document.getElementById("exportMarkdown").addEventListener("click", () => {

    const questions = window.getSelectedQuestions();

    if (questions.length === 0) {
        alert("No questions selected.");
        return;
    }

    questions.sort((a, b) => a.marks - b.marks);

    let md = "";

    questions.forEach((q, index) => {

        md += `- Q${index + 1}. ${q.question_text.trim()}\n`;

    });

    const blob = new Blob([md], {
        type: "text/markdown"
    });

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);

const today = new Date();

const yyyy = today.getFullYear();
const mm = String(today.getMonth() + 1).padStart(2, "0");
const dd = String(today.getDate()).padStart(2, "0");

a.download = `${yyyy}-${mm}-${dd}-Q.md`;

    a.click();

    URL.revokeObjectURL(a.href);

});


function importMarkdownFile(e) {
    const file = e.target.files[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
        importMarkdownQuestions(reader.result);

        // Allow importing the same file again later
        e.target.value = "";
    };

    reader.readAsText(file);
}

function importMarkdownQuestions(md) {


    document.getElementById("customQuestionPanel").style.display = "block";

    const lines = md.split(/\r?\n/);

    lines.forEach(line => {

        line = line.trim();

        // Accept only lines beginning with "- Q"
        if (!line.startsWith("- Q"))
            return;

        // Remove "- Q1. "
        const question = line.replace(/^- Q\d+\.\s*/, "").trim();

        if (!question)
            return;

        const q = {

            question_id: "CUSTOM_" + customCounter++,

            question_text: question,

            year: "",

            gs_paper: "",

            marks: 10,

            word_limit: 150,

            official_syllabus_topics: []

        };

        customQuestions.push(q);

        selectionMap.set(q.question_id, true);

        appendCustomRow(q);

    });

    updateSummary();
}