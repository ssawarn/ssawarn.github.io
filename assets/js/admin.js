/* admin.js — Contact tracker for ssawarn.github.io
 * Data stored in a private GitHub Gist (never in the public repo).
 * Auth: GitHub Personal Access Token with `gist` scope.
 */
(function () {
  "use strict";

  const GITHUB_API = "https://api.github.com";
  const GIST_FILENAME = "ssawarn_contacts.json";

  let token = "";
  let gistId = "";
  let contacts = [];
  let editingId = null;

  // ── Init ─────────────────────────────────────────────────────────────────

  window.addEventListener("DOMContentLoaded", function () {
    // Restore session if available
    const savedToken = localStorage.getItem("ct_token");
    const savedGist = localStorage.getItem("ct_gist");
    if (savedToken && savedGist) {
      token = savedToken;
      gistId = savedGist;
      loadAndShow();
    }

    // Login
    document.getElementById("login-btn").addEventListener("click", login);
    document.getElementById("pat-input").addEventListener("keydown", function (e) {
      if (e.key === "Enter") login();
    });

    // Admin panel
    document.getElementById("logout-btn").addEventListener("click", logout);
    document.getElementById("add-btn").addEventListener("click", function () {
      openModal(null);
    });
    document.getElementById("search-input").addEventListener("input", function (e) {
      renderTable(e.target.value);
    });

    // Modal
    document.getElementById("contact-form").addEventListener("submit", saveContact);
    document.getElementById("modal-cancel").addEventListener("click", closeModal);
    document.getElementById("contact-modal").addEventListener("click", function (e) {
      if (e.target === document.getElementById("contact-modal")) closeModal();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeModal();
    });
  });

  // ── Auth ─────────────────────────────────────────────────────────────────

  async function login() {
    var input = document.getElementById("pat-input");
    token = input.value.trim();
    if (!token) {
      showLoginError("Enter your access key.");
      return;
    }
    setLoginLoading(true);
    try {
      var resp = await ghFetch("/gists?per_page=100");
      if (!resp.ok) throw new Error("bad_token");

      var gists = await resp.json();
      var found = gists.find(function (g) {
        return g.files[GIST_FILENAME];
      });

      if (found) {
        gistId = found.id;
        await loadContacts();
      } else {
        await createGist();
        contacts = [];
      }

      localStorage.setItem("ct_token", token);
      localStorage.setItem("ct_gist", gistId);
      showAdmin();
    } catch (e) {
      showLoginError("Invalid access key or connection error.");
      token = "";
    } finally {
      setLoginLoading(false);
    }
  }

  async function loadAndShow() {
    try {
      await loadContacts();
      showAdmin();
    } catch (e) {
      // Session expired — back to login
      localStorage.removeItem("ct_token");
      localStorage.removeItem("ct_gist");
      token = "";
      gistId = "";
    }
  }

  function logout() {
    localStorage.removeItem("ct_token");
    localStorage.removeItem("ct_gist");
    token = "";
    gistId = "";
    contacts = [];
    document.getElementById("login-screen").style.display = "";
    document.getElementById("admin-panel").style.display = "none";
    document.getElementById("pat-input").value = "";
    document.getElementById("login-error").style.display = "none";
  }

  // ── GitHub Gist API ───────────────────────────────────────────────────────

  function ghFetch(path, opts) {
    opts = opts || {};
    return fetch(
      GITHUB_API + path,
      Object.assign({}, opts, {
        headers: Object.assign(
          {
            Authorization: "token " + token,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
          },
          opts.headers || {}
        ),
      })
    );
  }

  async function createGist() {
    var resp = await ghFetch("/gists", {
      method: "POST",
      body: JSON.stringify({
        description: "Private contacts — ssawarn.github.io",
        public: false,
        files: {
          [GIST_FILENAME]: {
            content: JSON.stringify({ contacts: [] }, null, 2),
          },
        },
      }),
    });
    if (!resp.ok) throw new Error("create_failed");
    var data = await resp.json();
    gistId = data.id;
  }

  async function loadContacts() {
    var resp = await ghFetch("/gists/" + gistId);
    if (!resp.ok) throw new Error("load_failed");
    var data = await resp.json();
    var raw = data.files[GIST_FILENAME].content;
    contacts = JSON.parse(raw).contacts || [];
  }

  async function persistContacts() {
    showStatus("Saving\u2026", "info");
    try {
      var resp = await ghFetch("/gists/" + gistId, {
        method: "PATCH",
        body: JSON.stringify({
          files: {
            [GIST_FILENAME]: {
              content: JSON.stringify({ contacts: contacts }, null, 2),
            },
          },
        }),
      });
      if (!resp.ok) throw new Error("save_failed");
      showStatus("Saved \u00b7 " + new Date().toLocaleTimeString(), "ok");
    } catch (e) {
      showStatus("Save failed \u2014 check connection.", "error");
    }
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function todayStr() {
    return new Date().toISOString().split("T")[0];
  }

  function getFormData() {
    var form = document.getElementById("contact-form");
    return {
      person: form.elements["person"].value.trim(),
      affiliation: form.elements["affiliation"].value.trim(),
      met_where: form.elements["met_where"].value.trim(),
      email: form.elements["email"].value.trim(),
      contact: form.elements["contact"].value.trim(),
      notes: form.elements["notes"].value.trim(),
    };
  }

  function saveContact(e) {
    e.preventDefault();
    var data = getFormData();
    if (!data.person) {
      alert("Person name is required.");
      return;
    }
    if (editingId) {
      var idx = contacts.findIndex(function (c) {
        return c.id === editingId;
      });
      if (idx >= 0) contacts[idx] = Object.assign({}, contacts[idx], data);
    } else {
      contacts.unshift(Object.assign({ id: genId(), date_added: todayStr() }, data));
    }
    closeModal();
    renderTable(document.getElementById("search-input").value);
    persistContacts();
  }

  function deleteRow(id) {
    var c = contacts.find(function (x) {
      return x.id === id;
    });
    if (!c) return;
    if (!confirm('Delete contact "' + c.person + '"?')) return;
    contacts = contacts.filter(function (x) {
      return x.id !== id;
    });
    renderTable(document.getElementById("search-input").value);
    persistContacts();
  }

  // ── Modal ─────────────────────────────────────────────────────────────────

  function openModal(id) {
    editingId = id;
    var form = document.getElementById("contact-form");
    form.reset();
    if (id) {
      var c = contacts.find(function (x) {
        return x.id === id;
      });
      if (!c) return;
      ["person", "affiliation", "met_where", "email", "contact", "notes"].forEach(function (f) {
        if (form.elements[f]) form.elements[f].value = c[f] || "";
      });
      document.getElementById("modal-title").textContent = "Edit Contact";
    } else {
      document.getElementById("modal-title").textContent = "New Contact";
    }
    document.getElementById("contact-modal").style.display = "flex";
    setTimeout(function () {
      form.elements["person"].focus();
    }, 50);
  }

  function closeModal() {
    document.getElementById("contact-modal").style.display = "none";
    editingId = null;
  }

  // ── Render table ──────────────────────────────────────────────────────────

  function renderTable(filter) {
    var q = (filter || "").toLowerCase();
    var rows = contacts.filter(function (c) {
      return (
        !q ||
        Object.values(c).some(function (v) {
          return String(v).toLowerCase().includes(q);
        })
      );
    });

    var tbody = document.getElementById("contacts-tbody");

    if (rows.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="8" class="empty-msg">' +
        (contacts.length === 0 ? "No contacts yet. Add your first one!" : "No results for &ldquo;" + esc(filter) + "&rdquo;.") +
        "</td></tr>";
    } else {
      tbody.innerHTML = rows
        .map(function (c) {
          var emailCell = c.email ? '<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + "</a>" : "";
          var notes = c.notes ? esc(c.notes.slice(0, 60)) + (c.notes.length > 60 ? "\u2026" : "") : "";
          return (
            "<tr>" +
            '<td class="td-date">' +
            esc(c.date_added || "") +
            "</td>" +
            '<td class="td-main"><strong>' +
            esc(c.person || "") +
            "</strong></td>" +
            "<td>" +
            esc(c.affiliation || "") +
            "</td>" +
            "<td>" +
            esc(c.met_where || "") +
            "</td>" +
            "<td>" +
            emailCell +
            "</td>" +
            "<td>" +
            esc(c.contact || "") +
            "</td>" +
            '<td class="td-notes">' +
            notes +
            "</td>" +
            '<td class="td-actions">' +
            '<button class="btn-edit" onclick="adminEditRow(\'' +
            c.id +
            "')\">Edit</button>" +
            '<button class="btn-del" onclick="adminDeleteRow(\'' +
            c.id +
            "')\">Del</button>" +
            "</td>" +
            "</tr>"
          );
        })
        .join("");
    }

    document.getElementById("contact-count").textContent = rows.length + " of " + contacts.length + " contact" + (contacts.length !== 1 ? "s" : "");
  }

  // ── UI helpers ────────────────────────────────────────────────────────────

  function showAdmin() {
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("admin-panel").style.display = "";
    renderTable();
  }

  function showLoginError(msg) {
    var el = document.getElementById("login-error");
    el.textContent = msg;
    el.style.display = "";
  }

  function setLoginLoading(on) {
    var btn = document.getElementById("login-btn");
    btn.disabled = on;
    btn.textContent = on ? "Connecting\u2026" : "Enter";
    if (on) document.getElementById("login-error").style.display = "none";
  }

  function showStatus(msg, type) {
    var el = document.getElementById("status-bar");
    el.textContent = msg;
    el.className = "status-" + type;
  }

  function esc(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ── Expose to inline onclick handlers ────────────────────────────────────
  window.adminEditRow = openModal;
  window.adminDeleteRow = deleteRow;
})();
