const reveals = document.querySelectorAll(".reveal");
const currentPage = document.body.dataset.page;
const activeNav = document.querySelector(`[data-nav="${currentPage}"]`);
const activeGroup = document.querySelector(`[data-nav-group="${currentPage}"]`);
const contactForm = document.querySelector(".contact-card[action]");
const contactFormFeedback = document.querySelector(".form-feedback");
const chatbot = document.querySelector(".chatbot");
const isServedOverHttp = window.location.protocol === "http:" || window.location.protocol === "https:";
const chatSessionKey = "skillnest_chat_session_id";
const leadPrefillKey = "skillnest_lead_prefill";
const apiBase = String(window.SKILLNEST_CONFIG?.apiBase || "").replace(/\/$/, "");
const chatSessionId =
  window.localStorage.getItem(chatSessionKey) ||
  (window.crypto?.randomUUID ? window.crypto.randomUUID() : `session-${Date.now()}`);
const apiUrl = (pathname) => (apiBase ? `${apiBase}${pathname}` : pathname);
const skillNestKnowledge = {
  contact:
    "You can contact SkillNest at 9284543320, email nileshdgaikwad8805@gmail.com, or use the WhatsApp button on this page for a faster reply.",
  audience:
    "SkillNest is built for college students, freshers, early professionals, and knowledge seekers.",
  location: "SkillNest is based in Pune, Maharashtra.",
  services:
    "SkillNest offers Cloud, Data Analysis, AI, and Cybersecurity trainings, along with free and paid workshops.",
  workshops:
    "SkillNest runs both free and paid workshops. You can check the Upcoming Workshops page to see current workshop options and book your seat.",
  recommendation:
    "If you are just starting, a free workshop is the best first step. If you already want deeper practical learning, a paid workshop or full training track is a better fit.",
};

window.localStorage.setItem(chatSessionKey, chatSessionId);

if (activeNav) {
  activeNav.classList.add("is-active");
}

if (activeGroup) {
  activeGroup.classList.add("is-active");
}

if (contactForm) {
  const savedLead = window.localStorage.getItem(leadPrefillKey);
  if (savedLead) {
    try {
      const lead = JSON.parse(savedLead);
      const nameField = contactForm.querySelector('[name="name"]');
      const emailField = contactForm.querySelector('[name="email"]');
      const organizationField = contactForm.querySelector('[name="organization"]');
      const interestField = contactForm.querySelector('[name="interest"]');
      const messageField = contactForm.querySelector('[name="message"]');

      if (nameField instanceof HTMLInputElement && lead.name) {
        nameField.value = lead.name;
      }

      if (emailField instanceof HTMLInputElement && typeof lead.contact === "string" && lead.contact.includes("@")) {
        emailField.value = lead.contact;
      }

      if (organizationField instanceof HTMLInputElement) {
        organizationField.value = lead.learnerType || "";
      }

      if (interestField instanceof HTMLSelectElement && lead.interest) {
        const matchingOption = Array.from(interestField.options).find(
          (option) => option.value.toLowerCase() === String(lead.interest).toLowerCase()
        );
        if (matchingOption) {
          interestField.value = matchingOption.value;
        }
      }

      if (messageField instanceof HTMLTextAreaElement) {
        messageField.value =
          `I already shared my details in the chatbot.\n` +
          `Learner type: ${lead.learnerType || "Not shared"}\n` +
          `Interest: ${lead.interest || "Not shared"}\n` +
          `Preferred contact: ${lead.contact || "Not shared"}\n\n` +
          `Please guide me on the best next step.`;
      }

      if (contactFormFeedback) {
        contactFormFeedback.hidden = false;
        contactFormFeedback.textContent =
          "Your chatbot details have been filled in here. You can review and send the inquiry.";
      }
    } catch (error) {
      console.error(error);
    }
  }

  contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(contactForm);
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const organization = String(formData.get("organization") || "").trim();
    const interest = String(formData.get("interest") || "").trim();
    const message = String(formData.get("message") || "").trim();
    const recipient = contactForm.dataset.fallbackEmail || "";

    const subject = encodeURIComponent("New SkillNest Inquiry");
    const body = encodeURIComponent(
      [
        `Name: ${name}`,
        `Email: ${email}`,
        `Company or College: ${organization}`,
        `Interested In: ${interest}`,
        "",
        "Message:",
        message,
      ].join("\n")
    );

    if (!isServedOverHttp) {
      window.location.href = `mailto:${recipient}?subject=${subject}&body=${body}`;
      return;
    }

    try {
      const response = await fetch(apiUrl(contactForm.dataset.apiEndpoint || "/api/contact"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          organization,
          interest,
          message,
          source: "contact_form",
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || "Unable to save inquiry.");
      }

      window.localStorage.removeItem(leadPrefillKey);
      contactForm.reset();
      if (contactFormFeedback) {
        contactFormFeedback.hidden = false;
        contactFormFeedback.textContent =
          "Thanks. Your inquiry has been saved successfully in the SkillNest app.";
      }
    } catch (error) {
      if (contactFormFeedback) {
        contactFormFeedback.hidden = false;
        contactFormFeedback.textContent =
          error instanceof Error ? error.message : "Unable to save inquiry right now.";
      }
    }
  });
}

if (chatbot) {
  const toggle = chatbot.querySelector(".chatbot__toggle");
  const panel = chatbot.querySelector(".chatbot__panel");
  const close = chatbot.querySelector(".chatbot__close");
  const messages = chatbot.querySelector(".chatbot__messages");
  const form = chatbot.querySelector(".chatbot__form");
  const input = chatbot.querySelector(".chatbot__input");
  const leadCapture = {
    active: false,
    step: null,
    data: {
      name: "",
      contact: "",
      learnerType: "",
      interest: "",
    },
  };

  const leadSteps = ["name", "contact", "learnerType", "interest"];
  const leadPrompts = {
    name: "Great. What is your name?",
    contact: "How should SkillNest contact you? Share your phone number or email.",
    learnerType: "Are you a college student, fresher, early professional, or knowledge seeker?",
    interest: "Which area are you most interested in: Cloud, Data Analysis, AI, Cybersecurity, Free Workshop, or Paid Workshop?",
  };
  const highIntentPatterns = [
    "enroll",
    "join",
    "admission",
    "admissions",
    "register",
    "sign up",
    "signup",
    "book",
    "call me",
    "contact me",
    "interested",
    "i want to start",
    "i want to join",
    "i want to enroll",
  ];

  const getLocalReply = async (text) => {
    const lower = text.toLowerCase();

    if (lower.includes("cloud")) {
      return "SkillNest offers practical Cloud training for college students, freshers, and early professionals. You can ask us through Contact or WhatsApp to know the next batch.";
    }

    if (lower.includes("data")) {
      return "We offer Data Analysis training focused on practical understanding, tools, and analytical thinking. It is designed to be beginner-friendly and career-relevant.";
    }

    if (lower.includes("ai")) {
      return "SkillNest provides AI training for curious learners who want practical exposure, guided learning, and workshop-based understanding of modern AI topics.";
    }

    if (lower.includes("cyber")) {
      return "Our Cybersecurity training is built for learners who want to understand security basics, awareness, and future career possibilities in cybersecurity.";
    }

    if (lower.includes("workshop") || lower.includes("free") || lower.includes("paid")) {
      return skillNestKnowledge.workshops;
    }

    if (
      lower.includes("which") ||
      lower.includes("recommend") ||
      lower.includes("best") ||
      lower.includes("start")
    ) {
      return `${skillNestKnowledge.recommendation} ${skillNestKnowledge.contact}`;
    }

    if (lower.includes("college") || lower.includes("student") || lower.includes("fresher")) {
      return skillNestKnowledge.audience;
    }

    if (lower.includes("contact") || lower.includes("phone") || lower.includes("email") || lower.includes("whatsapp")) {
      return skillNestKnowledge.contact;
    }

    if (lower.includes("location") || lower.includes("pune")) {
      return skillNestKnowledge.location;
    }

    if (lower.includes("service") || lower.includes("training")) {
      return skillNestKnowledge.services;
    }

    if (lower.includes("hello") || lower.includes("hi")) {
      return "Hello! I can help with SkillNest trainings, workshops, contact details, audience, and learning paths. What would you like to know?";
    }

    return "I can help with SkillNest trainings in Cloud, Data Analysis, AI, Cybersecurity, workshops, and contact details. Try asking about a course, workshop, how to contact us, or upcoming workshops.";
  };

  const botReplies = async (text, history) => {
    if (!isServedOverHttp) {
      return getLocalReply(text);
    }

    try {
      const response = await fetch(apiUrl("/api/chat"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: chatSessionId,
          message: text,
          messages: history,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || "Chat request failed.");
      }

      return payload.reply || getLocalReply(text);
    } catch (error) {
      console.error(error);
      return `${await getLocalReply(text)} If you want the full AI version, start the local server with a Gemini API key.`;
    }
  };

  const addMessage = (text, sender) => {
    const bubble = document.createElement("div");
    bubble.className = `chatbot__bubble chatbot__bubble--${sender}`;
    bubble.textContent = text;
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
  };

  const resetLeadCapture = () => {
    leadCapture.active = false;
    leadCapture.step = null;
    leadCapture.data = {
      name: "",
      contact: "",
      learnerType: "",
      interest: "",
    };
  };

  const startLeadCapture = () => {
    resetLeadCapture();
    leadCapture.active = true;
    leadCapture.step = leadSteps[0];
    addMessage(
      "I can help you get started. I will collect a few details so SkillNest can guide you better.",
      "bot"
    );
    addMessage(leadPrompts[leadCapture.step], "bot");
  };

  const nextLeadStep = async () => {
    const currentIndex = leadSteps.indexOf(leadCapture.step);
    const nextStep = leadSteps[currentIndex + 1];

    if (!nextStep) {
      if (isServedOverHttp) {
        try {
          await fetch(apiUrl("/api/leads"), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              sessionId: chatSessionId,
              name: leadCapture.data.name,
              contact: leadCapture.data.contact,
              learnerType: leadCapture.data.learnerType,
              interest: leadCapture.data.interest,
            }),
          });
        } catch (error) {
          console.error(error);
        }
      }

      window.localStorage.setItem(leadPrefillKey, JSON.stringify(leadCapture.data));

      const summary =
        `Thanks ${leadCapture.data.name}. Here is your lead summary:\n` +
        `Name: ${leadCapture.data.name}\n` +
        `Contact: ${leadCapture.data.contact}\n` +
        `Learner Type: ${leadCapture.data.learnerType}\n` +
        `Interest: ${leadCapture.data.interest}\n\n` +
        `Your lead has been saved. Open the Contact page to see these details pre-filled, or continue via WhatsApp for a faster reply.`;
      addMessage(summary, "bot");
      resetLeadCapture();
      return;
    }

    leadCapture.step = nextStep;
    addMessage(leadPrompts[nextStep], "bot");
  };

  const saveLeadAnswer = async (text) => {
    if (!leadCapture.active || !leadCapture.step) {
      return false;
    }

    leadCapture.data[leadCapture.step] = text;
    await nextLeadStep();
    return true;
  };

  addMessage(
    isServedOverHttp
      ? "Hi, I am SkillNest AI. I can answer questions about trainings, workshops, and how to contact SkillNest."
      : "Hi, I am SkillNest AI. I am in local fallback mode right now. Start the local server with a Gemini API key for full AI answers.",
    "bot"
  );

  toggle.addEventListener("click", () => {
    const isHidden = panel.hasAttribute("hidden");
    if (isHidden) {
      panel.removeAttribute("hidden");
      toggle.setAttribute("aria-expanded", "true");
      input.focus();
    } else {
      panel.setAttribute("hidden", "");
      toggle.setAttribute("aria-expanded", "false");
    }
  });

  close.addEventListener("click", () => {
    panel.setAttribute("hidden", "");
    toggle.setAttribute("aria-expanded", "false");
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) {
      return;
    }

    addMessage(text, "user");
    input.value = "";

    if (leadCapture.active) {
      saveLeadAnswer(text);
      return;
    }

    const lower = text.toLowerCase();
    if (highIntentPatterns.some((pattern) => lower.includes(pattern))) {
      startLeadCapture();
      return;
    }

    const history = Array.from(messages.querySelectorAll(".chatbot__bubble")).map((bubble) => ({
      role: bubble.classList.contains("chatbot__bubble--user") ? "user" : "assistant",
      content: bubble.textContent || "",
    }));

    window.setTimeout(async () => {
      addMessage(await botReplies(text, history), "bot");
    }, 250);
  });
}

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  {
    threshold: 0.16,
  }
);

reveals.forEach((element, index) => {
  element.style.transitionDelay = `${Math.min(index * 70, 320)}ms`;
  revealObserver.observe(element);
});

const countElements = document.querySelectorAll("[data-count]");

const countObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) {
        return;
      }

      const element = entry.target;
      const target = Number(element.dataset.count);
      const duration = 1400;
      const start = performance.now();

      const frame = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const value = Math.floor(progress * target);
        element.textContent =
          target >= 1000 ? `${value.toLocaleString()}+` : `${value}+`;

        if (progress < 1) {
          requestAnimationFrame(frame);
        } else if (target === 92) {
          element.textContent = "92%";
        } else {
          element.textContent = `${target.toLocaleString()}+`;
        }
      };

      requestAnimationFrame(frame);
      countObserver.unobserve(element);
    });
  },
  { threshold: 0.5 }
);

countElements.forEach((element) => countObserver.observe(element));
