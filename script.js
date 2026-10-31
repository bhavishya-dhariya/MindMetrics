// =====================================================================
// MindMetrics frontend
//
// How this connects to FastAPI:
//   1. The user fills in the form.
//   2. We check the values in the browser (validateForm).
//   3. We send them as JSON with fetch() to POST {API_BASE_URL}/predict.
//   4. FastAPI replies with {"predicted_mental_health_score": 12.34}
//      and we show that exact number on the page.
// The score is never made up on the frontend.
// =====================================================================

// Change this one line when you deploy the backend somewhere else.
const API_BASE_URL = "https://mindmetrics-1-6xtc.onrender.com";

// Field names must match the FastAPI model exactly (same capital letters).
const NUMBER_FIELDS = {
  Age:                     { label: "Age",                  min: 10, max: 100, wholeNumber: true },
  Avg_Daily_Usage_Hours:   { label: "Daily usage hours",    min: 0,  max: 24 },
  Daily_Unlocks:           { label: "Daily unlocks",        min: 0,  wholeNumber: true },
  Study_Hours:             { label: "Study hours",          min: 0,  max: 24 },
  Physical_Activity_Hours: { label: "Physical activity",    min: 0,  max: 24 },
  Sleep_Hours_Per_Night:   { label: "Sleep hours",          min: 0,  max: 24 }
};

const TEXT_FIELDS = [
  "Gender", "Country", "Academic_Level",
  "Most_Used_Platform", "Purpose_Of_Use", "Stress_Level"
];

// Get the page elements we need
const form        = document.getElementById("assessment-form");
const submitBtn   = document.getElementById("submit-btn");
const resetBtn    = document.getElementById("reset-btn");
const againBtn    = document.getElementById("again-btn");
const formError   = document.getElementById("form-error");
const emptyBox    = document.getElementById("empty-state");
const loadingBox  = document.getElementById("loading-state");
const resultBox   = document.getElementById("result-state");
const scoreText   = document.getElementById("score");
const detailsList = document.getElementById("details-list");

// Used to block a second submit while one request is running
let isLoading = false;

// ---------- Small helper functions ----------

// Show or clear an error message under one field
function setFieldError(name, message) {
  document.getElementById("error-" + name).textContent = message;
  document.getElementById(name).parentElement.classList.toggle("invalid", message !== "");
}

// Show only one of: "empty", "loading", "result"
function showBox(which) {
  emptyBox.hidden   = which !== "empty";
  loadingBox.hidden = which !== "loading";
  resultBox.hidden  = which !== "result";
}

// ---------- Step 1: validate the form ----------
// Returns the data to send, or null if something is wrong.
function validateForm() {
  const data = {};
  let valid = true;

  // Number fields: convert text to a real number
  for (const name in NUMBER_FIELDS) {
    const rules = NUMBER_FIELDS[name];
    const text = document.getElementById(name).value.trim();
    const value = Number(text);
    let message = "";

    if (text === "" || isNaN(value)) {
      message = "Please enter a number.";
    } else if (rules.wholeNumber && !Number.isInteger(value)) {
      message = "Please enter a whole number.";
    } else if (value < rules.min) {
      message = "Must be at least " + rules.min + ".";
    } else if (rules.max !== undefined && value > rules.max) {
      message = "Must be at most " + rules.max + ".";
    }

    setFieldError(name, message);
    if (message) { valid = false; } else { data[name] = value; }
  }

  // Dropdowns and the country box: must not be empty
  for (const name of TEXT_FIELDS) {
    const value = document.getElementById(name).value.trim();
    const message = value === "" ? "This field is required." : "";
    setFieldError(name, message);
    if (message) { valid = false; } else { data[name] = value; }
  }

  return valid ? data : null;
}

// ---------- Step 2: send the data to FastAPI ----------
async function getPrediction(data) {
  let response;

  try {
    response = await fetch(API_BASE_URL + "/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
  } catch (error) {
    // fetch fails like this when the backend is off or unreachable
    throw new Error("Cannot reach the server. Make sure the FastAPI backend is running and try again.");
  }

  // Non-success HTTP status (e.g. 422 or 500)
  if (!response.ok) {
    if (response.status === 422) {
      throw new Error("The server did not accept some of your answers. Please check them and try again.");
    }
    throw new Error("The server had a problem (status " + response.status + "). Please try again later.");
  }

  const result = await response.json();
  const score = result.predicted_mental_health_score;

  if (typeof score !== "number") {
    throw new Error("The server response did not contain a valid score.");
  }
  return score;
}

// On desktop the panel is already visible, so nothing moves.
// On mobile it sits below the form, so we scroll it into view.
function scrollToPanel() {
  document.getElementById("result-panel").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// Counts the number up from 0 for a smooth effect.
// The final value is always the exact score returned by the model.
function showScoreWithCountUp(score) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) { scoreText.textContent = score; return; }

  const duration = 900;                      // milliseconds
  const start = performance.now();

  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    if (progress < 1) {
      scoreText.textContent = (score * progress).toFixed(2);
      requestAnimationFrame(step);
    } else {
      scoreText.textContent = score;         // exact final value
    }
  }
  requestAnimationFrame(step);
}

// ---------- Step 3: show the result ----------
function showResult(score, data) {
  showScoreWithCountUp(score);

  // Fill the "Assessment Details" list with what the user submitted
  detailsList.innerHTML = "";
  for (const name in data) {
    const item = document.createElement("li");
    const label = document.createElement("span");
    const value = document.createElement("strong");
    label.textContent = name.replaceAll("_", " ");
    value.textContent = data[name];
    item.append(label, value);
    detailsList.appendChild(item);
  }

  showBox("result");
  scrollToPanel();
}

// ---------- Events ----------

// When the form is submitted
form.addEventListener("submit", async function (event) {
  event.preventDefault();               // stop the page from reloading
  if (isLoading) return;                // ignore duplicate clicks

  formError.hidden = true;
  const data = validateForm();
  if (data === null) return;            // errors are already shown under the fields

  isLoading = true;
  submitBtn.disabled = true;
  submitBtn.textContent = "Analysing...";
  showBox("loading");
  scrollToPanel();

  try {
    const score = await getPrediction(data);
    showResult(score, data);
  } catch (error) {
    showBox("empty");
    formError.textContent = error.message;
    formError.hidden = false;
    document.getElementById("assessment").scrollIntoView({ behavior: "smooth" });
  } finally {
    isLoading = false;
    submitBtn.disabled = false;
    submitBtn.textContent = "Get Predicted Score";
  }
});

// Clear the form, errors, and any previous result
function resetEverything() {
  form.reset();
  stressButtons.forEach(function (b) { b.setAttribute("aria-pressed", "false"); });
  formError.hidden = true;
  document.querySelectorAll(".error").forEach(function (el) { el.textContent = ""; });
  document.querySelectorAll(".field").forEach(function (el) { el.classList.remove("invalid"); });
  showBox("empty");
}

resetBtn.addEventListener("click", resetEverything);

againBtn.addEventListener("click", function () {
  resetEverything();
  document.getElementById("assessment").scrollIntoView({ behavior: "smooth" });
});

// Stress level buttons: clicking one saves its value in the hidden input
const stressInput = document.getElementById("Stress_Level");
const stressButtons = document.querySelectorAll(".segmented button");

stressButtons.forEach(function (button) {
  button.addEventListener("click", function () {
    stressInput.value = button.dataset.value;
    stressButtons.forEach(function (b) {
      b.setAttribute("aria-pressed", b === button ? "true" : "false");
    });
    setFieldError("Stress_Level", "");
  });
});
