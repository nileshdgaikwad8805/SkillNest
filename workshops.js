const workshopList = document.querySelector("#workshop-list");
const workshopsApiBase = String(window.VIDYAOPS_CONFIG?.apiBase || "").replace(/\/$/, "");
const workshopApiUrl = (pathname) => (workshopsApiBase ? `${workshopsApiBase}${pathname}` : pathname);

function renderWorkshopCard(workshop) {
  return `
    <article class="workshop-card reveal is-visible">
      <p class="workshop-card__type">${workshop.type}</p>
      <h3>${workshop.title}</h3>
      <p>${workshop.description}</p>
      <ul class="workshop-meta">
        <li>${workshop.schedule_text}</li>
        <li>${workshop.duration_text}</li>
        <li>${workshop.level_text}</li>
      </ul>
      <a class="button" href="${workshop.cta_link === 'contact.html' ? 'enroll.html' : workshop.cta_link}">${workshop.cta_text}</a>
    </article>
  `;
}

async function loadWorkshops() {
  if (!workshopList) {
    return;
  }

  if (window.location.protocol !== "http:" && window.location.protocol !== "https:") {
    workshopList.innerHTML = `
      <article class="workshop-card reveal is-visible">
        <p class="workshop-card__type">Local Preview</p>
        <h3>Start the VidyaOps server to load live workshops.</h3>
        <p>The workshop catalog is now database-driven. Open the site through localhost to load and manage workshops from the admin dashboard.</p>
        <a class="button" href="contact.html">Contact VidyaOps</a>
      </article>
    `;
    return;
  }

  try {
    const response = await fetch(workshopApiUrl("/api/workshops"));
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload?.error || "Unable to load workshops.");
    }

    const workshops = Array.isArray(payload.workshops) ? payload.workshops : [];

    if (!workshops.length) {
      workshopList.innerHTML = `
        <article class="workshop-card reveal is-visible">
          <p class="workshop-card__type">No Active Workshops</p>
          <h3>Fresh workshop dates will be announced soon.</h3>
          <p>Please contact VidyaOps or use WhatsApp if you want help choosing the right training path now.</p>
          <a class="button" href="contact.html">Send Inquiry</a>
        </article>
      `;
      return;
    }

    workshopList.innerHTML = workshops.map(renderWorkshopCard).join("");
  } catch (error) {
    workshopList.innerHTML = `
      <article class="workshop-card reveal is-visible">
        <p class="workshop-card__type">Unable to Load</p>
        <h3>The workshop list could not be loaded right now.</h3>
        <p>${error instanceof Error ? error.message : "Please try again shortly."}</p>
        <a class="button" href="contact.html">Contact VidyaOps</a>
      </article>
    `;
  }
}

loadWorkshops();
