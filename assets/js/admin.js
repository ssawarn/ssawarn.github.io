/* admin.js — Personal tracker for ssawarn.github.io
 * Sections: Contacts · Food · Movies
 * Data stored in a private GitHub Gist. Auth: PAT with `gist` scope.
 */
(function () {
  "use strict";

  const GITHUB_API = "https://api.github.com";
  const GIST_FILENAME = "ssawarn_contacts.json";

  // ── Section definitions ───────────────────────────────────────────────────

  const SECTIONS = {
    contacts: {
      label: "Contacts",
      icon: "👥",
      requiredKey: "person",
      fields: [
        { key: "person", label: "Person *", placeholder: "Full name", span: 1 },
        { key: "affiliation", label: "Affiliation", placeholder: "University / Institute", span: 1 },
        { key: "met_where", label: "Met where", placeholder: "Conference / Event / City", span: 1 },
        { key: "email", label: "Email", type: "email", placeholder: "email@example.com", span: 1 },
        { key: "contact", label: "Other contact", placeholder: "Twitter, LinkedIn, phone…", span: 2 },
        { key: "notes", label: "Notes", type: "textarea", placeholder: "Research interests, follow-up topics…", span: 2 },
      ],
      columns: [
        { label: "Date", key: "date_added", class: "td-date", hide: false },
        { label: "Person", key: "person", class: "td-main bold", hide: false },
        { label: "Affiliation", key: "affiliation", hide: true },
        { label: "Met where", key: "met_where", hide: true },
        { label: "Email", key: "email", isEmail: true, hide: false },
        { label: "Contact", key: "contact", hide: true },
        { label: "Notes", key: "notes", class: "td-notes", truncate: 60, hide: true },
      ],
    },
    food: {
      label: "Food",
      icon: "🍜",
      requiredKey: "dish",
      fields: [
        { key: "dish", label: "Dish / Meal *", placeholder: "What did you eat?", span: 2 },
        { key: "where", label: "Where", placeholder: "Restaurant / City / Occasion", span: 1 },
        { key: "rating", label: "Rating", placeholder: "1–5 ⭐", span: 1 },
        { key: "notes", label: "Notes", type: "textarea", placeholder: "How was it? Would you go back?", span: 2 },
      ],
      columns: [
        { label: "Date", key: "date_added", class: "td-date", hide: false },
        { label: "Dish / Meal", key: "dish", class: "td-main bold", hide: false },
        { label: "Where", key: "where", hide: false },
        { label: "Rating", key: "rating", hide: false },
        { label: "Notes", key: "notes", class: "td-notes", truncate: 60, hide: true },
      ],
    },
    movies: {
      label: "Movies",
      icon: "🎬",
      requiredKey: "title",
      fields: [
        { key: "title", label: "Title *", placeholder: "Movie / Show title", span: 2 },
        { key: "where", label: "Where watched", placeholder: "Cinema / Netflix / Amazon…", span: 1 },
        { key: "rating", label: "Rating", placeholder: "1–5 ⭐", span: 1 },
        { key: "notes", label: "Notes", type: "textarea", placeholder: "Thoughts, review, recommend?", span: 2 },
      ],
      columns: [
        { label: "Date", key: "date_added", class: "td-date", hide: false },
        { label: "Title", key: "title", class: "td-main bold", hide: false },
        { label: "Where", key: "where", hide: false },
        { label: "Rating", key: "rating", hide: false },
        { label: "Notes", key: "notes", class: "td-notes", truncate: 60, hide: true },
      ],
    },
  };

  // ── State ─────────────────────────────────────────────────────────────────

  let token = "";
  let gistId = "";
  let data = { contacts: [], food: [], movies: [] };
  let currentSection = "contacts";
  let editingId = null;

  // ── Init ──────────────────────────────────────────────────────────────────

  window.addEventListener("DOMContentLoaded", function () {
    var savedToken = localStorage.getItem("ct_token");
    var savedGist = localStorage.getItem("ct_gist");
    if (savedToken && savedGist) {
      token = savedToken;
      gistId = savedGist;
      loadAndShow();
    }

    document.getElementById("login-btn").addEventListener("click", login);
    document.getElementById("pat-input").addEventListener("keydown", function (e) {
      if (e.key === "Enter") login();
    });
    document.getElementById("logout-btn").addEventListener("click", logout);
    document.getElementById("add-btn").addEventListener("click", function () {
      openModal(null);
    });
    document.getElementById("search-input").addEventListener("input", function (e) {
      renderTable(e.target.value);
    });
    document.getElementById("record-form").addEventListener("submit", saveRecord);
    document.getElementById("modal-cancel").addEventListener("click", closeModal);
    document.getElementById("record-modal").addEventListener("click", function (e) {
      if (e.target === document.getElementById("record-modal")) closeModal();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeModal();
    });

    // Tab buttons
    document.querySelectorAll(".tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        switchSection(btn.dataset.section);
      });
    });
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

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
        await loadData();
      } else {
        await createGist();
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
      await loadData();
      showAdmin();
    } catch (e) {
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
    data = { contacts: [], food: [], movies: [] };
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
        description: "Private tracker — ssawarn.github.io",
        public: false,
        files: {
          [GIST_FILENAME]: {
            content: JSON.stringify({ contacts: [], food: [], movies: [] }, null, 2),
          },
        },
      }),
    });
    if (!resp.ok) throw new Error("create_failed");
    var d = await resp.json();
    gistId = d.id;
    data = { contacts: [], food: [], movies: [] };
  }

  async function loadData() {
    var resp = await ghFetch("/gists/" + gistId);
    if (!resp.ok) throw new Error("load_failed");
    var d = await resp.json();
    var raw = d.files[GIST_FILENAME].content;
    var parsed = JSON.parse(raw);
    data = {
      contacts: parsed.contacts || [],
      food: parsed.food || [],
      movies: parsed.movies || [],
    };
  }

  async function persistData() {
    showStatus("Saving\u2026", "info");
    try {
      var resp = await ghFetch("/gists/" + gistId, {
        method: "PATCH",
        body: JSON.stringify({
          files: {
            [GIST_FILENAME]: { content: JSON.stringify(data, null, 2) },
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
    var form = document.getElementById("record-form");
    var cfg = SECTIONS[currentSection];
    var result = {};
    cfg.fields.forEach(function (f) {
      var el = form.elements[f.key];
      if (el) result[f.key] = el.value.trim();
    });
    return result;
  }

  function saveRecord(e) {
    e.preventDefault();
    var d = getFormData();
    var req = SECTIONS[currentSection].requiredKey;
    if (!d[req]) {
      alert(req.charAt(0).toUpperCase() + req.slice(1) + " is required.");
      return;
    }
    var arr = data[currentSection];
    if (editingId) {
      var idx = arr.findIndex(function (r) {
        return r.id === editingId;
      });
      if (idx >= 0) arr[idx] = Object.assign({}, arr[idx], d);
    } else {
      arr.unshift(Object.assign({ id: genId(), date_added: todayStr() }, d));
    }
    closeModal();
    renderTable(document.getElementById("search-input").value);
    persistData();
  }

  function deleteRecord(id) {
    var arr = data[currentSection];
    var r = arr.find(function (x) {
      return x.id === id;
    });
    if (!r) return;
    var label = r[SECTIONS[currentSection].requiredKey] || "this entry";
    if (!confirm('Delete "' + label + '"?')) return;
    data[currentSection] = arr.filter(function (x) {
      return x.id !== id;
    });
    renderTable(document.getElementById("search-input").value);
    persistData();
  }

  // ── Modal ─────────────────────────────────────────────────────────────────

  function buildForm() {
    var cfg = SECTIONS[currentSection];
    var form = document.getElementById("record-form");
    // Remove old fields (keep submit row)
    var submitRow = form.querySelector(".modal-actions");
    form.innerHTML = "";
    form.appendChild(submitRow);

    cfg.fields.forEach(function (f) {
      var group = document.createElement("div");
      group.className = "form-group" + (f.span === 2 ? " span-2" : "");

      var label = document.createElement("label");
      label.textContent = f.label;
      group.appendChild(label);

      var input;
      if (f.type === "textarea") {
        input = document.createElement("textarea");
        input.name = f.key;
        input.placeholder = f.placeholder || "";
      } else {
        input = document.createElement("input");
        input.type = f.type || "text";
        input.name = f.key;
        input.placeholder = f.placeholder || "";
      }
      group.appendChild(input);
      form.insertBefore(group, submitRow);
    });
  }

  function openModal(id) {
    editingId = id;
    buildForm();
    var cfg = SECTIONS[currentSection];

    if (id) {
      var r = data[currentSection].find(function (x) {
        return x.id === id;
      });
      if (!r) return;
      cfg.fields.forEach(function (f) {
        var el = document.getElementById("record-form").elements[f.key];
        if (el) el.value = r[f.key] || "";
      });
      document.getElementById("modal-title").textContent = "Edit " + cfg.label.slice(0, -1 * 0 || cfg.label.length);
    } else {
      document.getElementById("modal-title").textContent = "Add to " + cfg.label;
    }

    document.getElementById("record-modal").style.display = "flex";
    setTimeout(function () {
      var first = document.getElementById("record-form").querySelector("input, textarea");
      if (first) first.focus();
    }, 50);
  }

  function closeModal() {
    document.getElementById("record-modal").style.display = "none";
    editingId = null;
  }

  // ── Tabs & Rendering ──────────────────────────────────────────────────────

  function switchSection(name) {
    if (!SECTIONS[name]) return;
    currentSection = name;
    document.getElementById("search-input").value = "";

    // Update tab styles
    document.querySelectorAll(".tab-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.section === name);
    });

    renderTableHeader();
    renderTable();
  }

  function renderTableHeader() {
    var cols = SECTIONS[currentSection].columns;
    var thead = document.getElementById("table-head");
    thead.innerHTML =
      "<tr>" +
      cols
        .map(function (c) {
          return '<th class="' + (c.hide ? "col-hide" : "") + '">' + c.label + "</th>";
        })
        .join("") +
      "<th></th></tr>";
  }

  function renderTable(filter) {
    var q = (filter || "").toLowerCase();
    var arr = data[currentSection];
    var cols = SECTIONS[currentSection].columns;

    var rows = arr.filter(function (r) {
      return (
        !q ||
        Object.values(r).some(function (v) {
          return String(v).toLowerCase().includes(q);
        })
      );
    });

    var tbody = document.getElementById("table-body");

    if (rows.length === 0) {
      var msg = arr.length === 0 ? "Nothing here yet. Add your first entry!" : "No results for \u201c" + esc(filter) + "\u201d.";
      tbody.innerHTML = '<tr><td colspan="' + (cols.length + 1) + '" class="empty-msg">' + msg + "</td></tr>";
    } else {
      tbody.innerHTML = rows
        .map(function (r) {
          var cells = cols
            .map(function (c) {
              var val = r[c.key] || "";
              var display = "";
              if (c.isEmail && val) {
                display = '<a href="mailto:' + esc(val) + '">' + esc(val) + "</a>";
              } else if (c.truncate && val.length > c.truncate) {
                display = esc(val.slice(0, c.truncate)) + "\u2026";
              } else {
                display = esc(val);
              }
              if (c.class && c.class.includes("bold")) display = "<strong>" + display + "</strong>";
              var tdClass = (c.class || "").replace(" bold", "") + (c.hide ? " col-hide" : "");
              return '<td class="' + tdClass.trim() + '">' + display + "</td>";
            })
            .join("");

          return (
            "<tr>" +
            cells +
            '<td class="td-actions">' +
            '<button class="btn-edit" onclick="adminEdit(\'' +
            r.id +
            "')\">\u270E</button>" +
            '<button class="btn-del" onclick="adminDelete(\'' +
            r.id +
            "')\">&#x2715;</button>" +
            "</td>" +
            "</tr>"
          );
        })
        .join("");
    }

    document.getElementById("record-count").textContent = rows.length + " of " + arr.length + " entr" + (arr.length !== 1 ? "ies" : "y");
  }

  // ── UI Helpers ────────────────────────────────────────────────────────────

  function showAdmin() {
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("admin-panel").style.display = "";
    switchSection("contacts");
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
  window.adminEdit = openModal;
  window.adminDelete = deleteRecord;
})();
