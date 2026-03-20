const inquiryCount = document.querySelector("#admin-inquiries");
const leadCount = document.querySelector("#admin-leads");
const chatCount = document.querySelector("#admin-chats");
const inquiryList = document.querySelector("#admin-inquiry-list");
const leadList = document.querySelector("#admin-lead-list");
const chatList = document.querySelector("#admin-chat-list");
const aiContentForm = document.querySelector("#admin-ai-content-form");
const aiContentFeedback = document.querySelector("#admin-ai-feedback");
const aiContentOutput = document.querySelector("#admin-ai-output");
const aiContentOutputText = document.querySelector("#admin-ai-output-text");
const refreshButtons = document.querySelectorAll(".admin-refresh");
const adminTokenKey = "skillnest_admin_token";
const apiBase = String(window.SKILLNEST_CONFIG?.apiBase || "").replace(/\/$/, "");
const apiUrl = (pathname) => (apiBase ? `${apiBase}${pathname}` : pathname);

function getAuthHeaders(includeJson = false) {
  const token = window.localStorage.getItem(adminTokenKey) || "";
  return {
    ...(includeJson ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function clearAdminSession() {
  window.localStorage.removeItem(adminTokenKey);
}

function handleUnauthorized() {
  clearAdminSession();
  window.location.href = "/admin-login.html";
}

function renderEmptyState(container, text) {
  container.innerHTML = `<p class="admin-empty">${text}</p>`;
}

function renderItems(container, items, formatter) {
  if (!container) {
    return;
  }

  if (!items.length) {
    renderEmptyState(container, "No records yet.");
    return;
  }

  container.innerHTML = items.map(formatter).join("");
}

function escapeAttribute(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function attachAdminControls() {
  document.querySelector("#admin-logout")?.addEventListener("click", async () => {
    await fetch(apiUrl("/api/admin/logout"), {
      method: "POST",
      headers: getAuthHeaders(),
    });
    clearAdminSession();
    window.location.href = "/admin-login.html";
  });

  const downloadCsv = async (pathname, filename) => {
    const response = await fetch(apiUrl(pathname), {
      headers: getAuthHeaders(),
    });

    if (response.status === 401) {
      handleUnauthorized();
      return;
    }

    if (!response.ok) {
      throw new Error("Unable to export CSV.");
    }

    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
  };

  document.querySelector("#export-inquiries")?.addEventListener("click", async () => {
    await downloadCsv("/api/admin/export/inquiries.csv", "skillnest-inquiries.csv");
  });

  document.querySelector("#export-leads")?.addEventListener("click", async () => {
    await downloadCsv("/api/admin/export/leads.csv", "skillnest-leads.csv");
  });

  document.querySelector("#export-workshops")?.addEventListener("click", async () => {
    await downloadCsv("/api/admin/export/workshops.csv", "skillnest-workshops.csv");
  });

  document.querySelector("#send-test-email")?.addEventListener("click", async () => {
    const feedback = document.querySelector("#admin-email-feedback");
    if (feedback) {
      feedback.hidden = true;
      feedback.textContent = "";
    }

    try {
      const response = await fetch(apiUrl("/api/admin/test-email"), {
        method: "POST",
        headers: getAuthHeaders(),
      });
      const payload = await response.json();

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!response.ok) {
        throw new Error(payload?.error || "Unable to send test email.");
      }

      if (feedback) {
        feedback.hidden = false;
        feedback.textContent = "Test email sent successfully.";
      }
    } catch (error) {
      if (feedback) {
        feedback.hidden = false;
        feedback.textContent =
          error instanceof Error ? error.message : "Unable to send test email.";
      }
    }
  });
}

function attachPasswordChange() {
  const form = document.querySelector("#admin-password-form");
  const feedback = document.querySelector("#admin-password-feedback");

  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const payload = {
      currentPassword: String(formData.get("currentPassword") || "").trim(),
      newPassword: String(formData.get("newPassword") || "").trim(),
      confirmPassword: String(formData.get("confirmPassword") || "").trim(),
    };

    try {
      const response = await fetch(apiUrl("/api/admin/change-password"), {
        method: "POST",
        headers: getAuthHeaders(true),
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!response.ok) {
        throw new Error(result?.error || "Unable to change password.");
      }

      form.reset();
      if (feedback) {
        feedback.hidden = false;
        feedback.textContent = "Admin password updated successfully.";
      }
    } catch (error) {
      if (feedback) {
        feedback.hidden = false;
        feedback.textContent =
          error instanceof Error ? error.message : "Unable to change password.";
      }
    }
  });
}

function attachWorkshopActions() {
  const form = document.querySelector("#workshop-form");
  const feedback = document.querySelector("#workshop-feedback");
  const workshopIdInput = document.querySelector("#workshop-id");
  const cancelButton = document.querySelector("#workshop-cancel");

  if (!form || !workshopIdInput) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const workshopId = String(formData.get("id") || "").trim();
    const payload = {
      title: String(formData.get("title") || "").trim(),
      type: String(formData.get("type") || "").trim(),
      description: String(formData.get("description") || "").trim(),
      scheduleText: String(formData.get("scheduleText") || "").trim(),
      durationText: String(formData.get("durationText") || "").trim(),
      levelText: String(formData.get("levelText") || "").trim(),
      ctaText: String(formData.get("ctaText") || "").trim(),
      ctaLink: String(formData.get("ctaLink") || "").trim(),
      isActive: Boolean(formData.get("isActive")),
    };

    const endpoint = workshopId ? apiUrl(`/api/admin/workshops/${workshopId}`) : apiUrl("/api/admin/workshops");
    const method = workshopId ? "PUT" : "POST";

    try {
      const response = await fetch(endpoint, {
        method,
        headers: getAuthHeaders(true),
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!response.ok) {
        throw new Error(result?.error || "Unable to save workshop.");
      }

      form.reset();
      workshopIdInput.value = "";
      if (feedback) {
        feedback.hidden = false;
        feedback.textContent = workshopId
          ? "Workshop updated successfully."
          : "Workshop created successfully.";
      }
      loadAdminOverview();
    } catch (error) {
      if (feedback) {
        feedback.hidden = false;
        feedback.textContent =
          error instanceof Error ? error.message : "Unable to save workshop.";
      }
    }
  });

  cancelButton?.addEventListener("click", () => {
    form.reset();
    workshopIdInput.value = "";
    if (feedback) {
      feedback.hidden = true;
      feedback.textContent = "";
    }
  });
}

function attachAiContentGenerator() {
  if (!aiContentForm || !aiContentFeedback || !aiContentOutput || !aiContentOutputText) {
    return;
  }

  aiContentForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    aiContentFeedback.hidden = true;
    aiContentFeedback.textContent = "";
    aiContentOutput.hidden = true;
    aiContentOutputText.textContent = "";

    const formData = new FormData(aiContentForm);
    const payload = {
      format: String(formData.get("format") || "").trim(),
      topic: String(formData.get("topic") || "").trim(),
      audience: String(formData.get("audience") || "").trim(),
      goal: String(formData.get("goal") || "").trim(),
      tone: String(formData.get("tone") || "").trim(),
    };

    try {
      const response = await fetch(apiUrl("/api/admin/ai-content"), {
        method: "POST",
        headers: getAuthHeaders(true),
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!response.ok) {
        throw new Error(result?.error || "Unable to generate AI content.");
      }

      aiContentOutput.hidden = false;
      aiContentOutputText.textContent = result.output || "";
      aiContentFeedback.hidden = false;
      aiContentFeedback.textContent = "AI draft generated successfully.";
    } catch (error) {
      aiContentFeedback.hidden = false;
      aiContentFeedback.textContent =
        error instanceof Error ? error.message : "Unable to generate AI content.";
    }
  });

  document.querySelector("#admin-ai-copy")?.addEventListener("click", async () => {
    const text = aiContentOutputText?.textContent || "";
    if (!text) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      aiContentFeedback.hidden = false;
      aiContentFeedback.textContent = "Generated draft copied to clipboard.";
    } catch (error) {
      aiContentFeedback.hidden = false;
      aiContentFeedback.textContent = "Unable to copy draft automatically.";
    }
  });
}

function attachDocumentActions() {
  document.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const workshopEditButton = target.closest("[data-workshop-edit]");
    const workshopDeleteButton = target.closest("[data-workshop-delete]");
    const leadSaveButton = target.closest("[data-lead-save]");
    const leadCard = target.closest("[data-lead-card]");

    if (workshopEditButton instanceof HTMLElement) {
      const form = document.querySelector("#workshop-form");
      const workshopIdInput = document.querySelector("#workshop-id");
      if (!form || !(workshopIdInput instanceof HTMLInputElement)) {
        return;
      }

      workshopIdInput.value = workshopEditButton.dataset.id || "";
      form.querySelector('[name="title"]').value = workshopEditButton.dataset.title || "";
      form.querySelector('[name="type"]').value = workshopEditButton.dataset.type || "";
      form.querySelector('[name="description"]').value = workshopEditButton.dataset.description || "";
      form.querySelector('[name="scheduleText"]').value = workshopEditButton.dataset.schedule || "";
      form.querySelector('[name="durationText"]').value = workshopEditButton.dataset.duration || "";
      form.querySelector('[name="levelText"]').value = workshopEditButton.dataset.level || "";
      form.querySelector('[name="ctaText"]').value = workshopEditButton.dataset.ctaText || "";
      form.querySelector('[name="ctaLink"]').value = workshopEditButton.dataset.ctaLink || "";
      form.querySelector('[name="isActive"]').checked = workshopEditButton.dataset.active === "1";
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (workshopDeleteButton instanceof HTMLElement) {
      const id = workshopDeleteButton.dataset.id;
      if (!id || !window.confirm("Delete this workshop?")) {
        return;
      }

      const response = await fetch(apiUrl(`/api/admin/workshops/${id}`), {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (response.ok) {
        loadAdminOverview();
      }
      return;
    }

    if (leadSaveButton instanceof HTMLElement && leadCard instanceof HTMLElement) {
      const id = leadSaveButton.dataset.id;
      const statusField = leadCard.querySelector("[data-lead-status]");
      const notesField = leadCard.querySelector("[data-lead-notes]");
      const feedback = leadCard.querySelector(".form-feedback");

      if (!id || !(statusField instanceof HTMLSelectElement) || !(notesField instanceof HTMLTextAreaElement)) {
        return;
      }

      try {
        const response = await fetch(apiUrl(`/api/admin/leads/${id}`), {
          method: "PUT",
          headers: getAuthHeaders(true),
          body: JSON.stringify({
            status: statusField.value,
            notes: notesField.value.trim(),
          }),
        });
        const payload = await response.json();

        if (response.status === 401) {
          handleUnauthorized();
          return;
        }

        if (!response.ok) {
          throw new Error(payload?.error || "Unable to update lead.");
        }

        if (feedback instanceof HTMLElement) {
          feedback.hidden = false;
          feedback.textContent = "Lead status updated.";
        }

        loadAdminOverview();
      } catch (error) {
        if (feedback instanceof HTMLElement) {
          feedback.hidden = false;
          feedback.textContent =
            error instanceof Error ? error.message : "Unable to update lead.";
        }
      }
    }
  });
}

async function loadAdminOverview() {
  try {
    const response = await fetch(apiUrl("/api/admin/overview"), {
      headers: getAuthHeaders(),
    });
    const payload = await response.json();

    if (response.status === 401) {
      handleUnauthorized();
      return;
    }

    if (!response.ok) {
      throw new Error(payload?.error || "Unable to load admin data.");
    }

    const username = document.querySelector("#admin-username");
    const notificationState = document.querySelector("#admin-notification-state");

    if (username) {
      username.textContent = payload.session?.username || "Admin";
    }

    if (notificationState) {
      notificationState.textContent = payload.notifications?.enabled
        ? `Email alerts active for ${payload.notifications.recipient}`
        : "Email alerts are not configured yet.";
    }

    inquiryCount.textContent = String(payload.counts.inquiries);
    leadCount.textContent = String(payload.counts.leads);
    chatCount.textContent = String(payload.counts.chatMessages);

    renderItems(inquiryList, payload.inquiries, (item) => `
      <article class="admin-item">
        <strong>${item.name}</strong>
        <p>${item.email}</p>
        <p>${item.interest}</p>
        <p>${item.message}</p>
        ${
          item.ai_summary || item.ai_next_step
            ? `<div class="admin-ai-snippet">
                <p><strong>AI Score:</strong> ${escapeHtml(item.ai_score)}</p>
                <p><strong>AI Summary:</strong> ${escapeHtml(item.ai_summary)}</p>
                <p><strong>AI Next Step:</strong> ${escapeHtml(item.ai_next_step)}</p>
                <p><strong>Follow-up Sent:</strong> ${item.ai_followup_sent ? "Yes" : "No"}</p>
              </div>`
            : ""
        }
        <span>${item.created_at}</span>
      </article>
    `);

    renderItems(leadList, payload.leads, (item) => `
      <article class="admin-item" data-lead-card>
        <strong>${item.name}</strong>
        <p>${item.contact}</p>
        <p>${item.learner_type}</p>
        <p>${item.interest}</p>
        <span class="admin-status admin-status--${item.status}">${item.status}</span>
        <label>
          Lead Status
          <select data-lead-status>
            ${["new", "contacted", "qualified", "enrolled", "closed"]
              .map(
                (status) =>
                  `<option value="${status}" ${item.status === status ? "selected" : ""}>${status}</option>`
              )
              .join("")}
          </select>
        </label>
        <label>
          Notes
          <textarea rows="3" data-lead-notes placeholder="Add follow-up notes">${item.notes || ""}</textarea>
        </label>
        ${
          item.ai_summary || item.ai_next_step
            ? `<div class="admin-ai-snippet">
                <p><strong>AI Score:</strong> ${escapeHtml(item.ai_score)}</p>
                <p><strong>AI Summary:</strong> ${escapeHtml(item.ai_summary)}</p>
                <p><strong>AI Next Step:</strong> ${escapeHtml(item.ai_next_step)}</p>
                <p><strong>Follow-up Sent:</strong> ${item.ai_followup_sent ? "Yes" : "No"}</p>
              </div>`
            : ""
        }
        <div class="admin-actions">
          <button
            type="button"
            class="button button--secondary"
            data-lead-save
            data-id="${item.id}"
          >Save Lead</button>
        </div>
        <p class="form-feedback" hidden></p>
        <span>Created ${item.created_at}</span>
      </article>
    `);

    renderItems(chatList, payload.chatMessages, (item) => `
      <article class="admin-item">
        <strong>${item.role}</strong>
        <p>${item.content}</p>
        <span>${item.created_at}</span>
      </article>
    `);

    const workshopList = document.querySelector("#admin-workshop-list");
    renderItems(workshopList, payload.workshops, (item) => `
      <article class="admin-item">
        <strong>${item.title}</strong>
        <p>${item.type}</p>
        <p>${item.schedule_text} | ${item.duration_text} | ${item.level_text}</p>
        <p>${item.description}</p>
        ${
          item.ai_workshop_description || item.ai_announcement || item.ai_social_posts
            ? `<div class="admin-ai-snippet">
                <p><strong>AI Description:</strong> ${escapeHtml(item.ai_workshop_description)}</p>
                <p><strong>AI Announcement:</strong> ${escapeHtml(item.ai_announcement)}</p>
                <p><strong>AI Social Drafts:</strong></p>
                <pre>${escapeHtml(item.ai_social_posts)}</pre>
              </div>`
            : ""
        }
        <span>${item.is_active ? "Active" : "Inactive"}</span>
        <div class="admin-actions">
          <button
            type="button"
            class="button button--secondary"
            data-workshop-edit
            data-id="${item.id}"
            data-title="${escapeAttribute(item.title)}"
            data-type="${escapeAttribute(item.type)}"
            data-description="${escapeAttribute(item.description)}"
            data-schedule="${escapeAttribute(item.schedule_text)}"
            data-duration="${escapeAttribute(item.duration_text)}"
            data-level="${escapeAttribute(item.level_text)}"
            data-cta-text="${escapeAttribute(item.cta_text)}"
            data-cta-link="${escapeAttribute(item.cta_link)}"
            data-active="${item.is_active}"
          >Edit</button>
          <button
            type="button"
            class="button button--secondary"
            data-workshop-delete
            data-id="${item.id}"
          >Delete</button>
        </div>
      </article>
    `);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load admin data.";
    [inquiryList, leadList, chatList].forEach((container) => renderEmptyState(container, message));
  }
}

refreshButtons.forEach((button) => {
  button.addEventListener("click", loadAdminOverview);
});

attachAdminControls();
attachPasswordChange();
attachWorkshopActions();
attachAiContentGenerator();
attachDocumentActions();
loadAdminOverview();
