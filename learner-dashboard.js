const learnerIntro = document.querySelector("#learner-dashboard-intro");
const learnerSummaryCard = document.querySelector("#learner-summary-card");
const learnerSuccessMessage = document.querySelector("#payment-success-message");
const learnerSuccessLink = document.querySelector("#success-dashboard-link");
const learnerApiBase = String(window.VIDYAOPS_CONFIG?.apiBase || "").replace(/\/$/, "");
const learnerApiUrl = (pathname) => (learnerApiBase ? `${learnerApiBase}${pathname}` : pathname);
const learnerTokenStorageKey = "vidyaops_learner_token";

function getLearnerToken() {
  const url = new URL(window.location.href);
  const tokenFromQuery = String(url.searchParams.get("token") || "").trim();
  const token = tokenFromQuery || window.localStorage.getItem(learnerTokenStorageKey) || "";
  if (token) {
    window.localStorage.setItem(learnerTokenStorageKey, token);
  }
  return token;
}

async function loadLearnerSession() {
  const token = getLearnerToken();
  if (!token) {
    throw new Error("Learner token is missing. Please enroll first.");
  }

  const response = await fetch(`${learnerApiUrl("/api/learner/session")}?token=${encodeURIComponent(token)}`);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error || "Unable to load learner dashboard.");
  }

  return { token, enrollment: payload.enrollment };
}

function renderLearnerDashboard(enrollment) {
  if (learnerIntro) {
    learnerIntro.textContent = `Welcome ${enrollment.learnerName}. Your ${enrollment.productName} enrollment is active.`;
  }

  if (learnerSummaryCard) {
    learnerSummaryCard.innerHTML = `
      <p class="story-card__label">Enrollment Summary</p>
      <h3>${enrollment.productName}</h3>
      <p>Status: ${enrollment.status}</p>
      <p>Learner type: ${enrollment.learnerType}</p>
      <p>Phone: ${enrollment.learnerPhone}</p>
      <p>Email: ${enrollment.learnerEmail}</p>
      <p>Onboarding email: ${enrollment.onboardingSent ? "Sent" : "Pending"}</p>
      <p>Goal: ${enrollment.learnerGoal || "To be updated with VidyaOps guidance."}</p>
    `;
  }

  if (learnerSuccessMessage) {
    learnerSuccessMessage.textContent = `Enrollment confirmed for ${enrollment.productName}. Your learner dashboard is ready.`;
  }
}

async function initializeLearnerView() {
  try {
    const { token, enrollment } = await loadLearnerSession();
    renderLearnerDashboard(enrollment);
    if (learnerSuccessLink) {
      learnerSuccessLink.href = `learner-dashboard.html?token=${encodeURIComponent(token)}`;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load learner dashboard.";
    if (learnerIntro) {
      learnerIntro.textContent = message;
    }
    if (learnerSuccessMessage) {
      learnerSuccessMessage.textContent = message;
    }
  }
}

initializeLearnerView();
