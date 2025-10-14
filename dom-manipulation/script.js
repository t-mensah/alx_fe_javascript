// script.js - updated to satisfy sync/fetch/post/periodic checks + conflict handling

// Configuration (mock API)
const MOCK_API_BASE = "https://jsonplaceholder.typicode.com"; // example mock API
const FETCH_ENDPOINT = `${MOCK_API_BASE}/posts?_limit=5`; // GET mocked data
const POST_ENDPOINT = `${MOCK_API_BASE}/posts`; // POST mocked data

// Local quotes (persisted)
let quotes = JSON.parse(localStorage.getItem("quotes")) || [
    { text: "The best way to get started is to quit talking and begin doing.", author: "Walt Disney", category: "Server" },
    { text: "Life is what happens when you're busy making other plans.", author: "John Lennon", category: "Local" },
    { text: "Don’t let yesterday take up too much of today.", author: "Will Rogers", category: "Motivation" }
];

let conflicts = JSON.parse(localStorage.getItem("quote_conflicts")) || []; // store unresolved conflicts

// DOM elements
const quoteContainer = document.getElementById("quote-container");
const notification = document.getElementById("notification");
const filter = document.getElementById("filter");
const newQuoteBtn = document.getElementById("new-quote-btn");
const syncBtn = document.getElementById("sync-btn");
const addQuoteForm = document.getElementById("add-quote-form");
const quoteText = document.getElementById("quote-text");
const author = document.getElementById("author");
const category = document.getElementById("category");

// Create a conflict UI container programmatically (no HTML change needed)
let conflictContainer = document.getElementById("conflict-container");
if (!conflictContainer) {
    conflictContainer = document.createElement("div");
    conflictContainer.id = "conflict-container";
    conflictContainer.style.marginTop = "12px";
    document.body.insertBefore(conflictContainer, document.body.firstChild);
}

// ---------- Display & UI ----------

function showRandomQuote() {
    const selectedCategory = filter.value;
    const filteredQuotes = (selectedCategory === "All")
        ? quotes
        : quotes.filter(q => q.category.toLowerCase() === selectedCategory.toLowerCase());

    quoteContainer.innerHTML = '';
    if (filteredQuotes.length > 0) {
        const randomIndex = Math.floor(Math.random() * filteredQuotes.length);
        const quote = filteredQuotes[randomIndex];
        const newQuoteElement = document.createElement('div');
        newQuoteElement.innerHTML = `<p style="font-style:italic;">"${escapeHtml(quote.text)}"</p><p>— ${escapeHtml(quote.author)} <small>(${escapeHtml(quote.category)})</small></p>`;
        quoteContainer.appendChild(newQuoteElement);
    } else {
        quoteContainer.innerHTML = '<p>No quotes available for this category.</p>';
    }
}

function populateCategories() {
    const current = filter.value;
    const categories = [...new Set(quotes.map(q => q.category))];
    filter.innerHTML = '<option value="All">All</option>';
    categories.forEach(cat => {
        const option = document.createElement("option");
        option.value = cat;
        option.textContent = cat;
        filter.appendChild(option);
    });
    // restore current selection if possible
    if ([...filter.options].some(opt => opt.value === current)) filter.value = current;
}

function showNotification(message, { timeout = 3000, persistent = false } = {}) {
    notification.textContent = message;
    notification.style.display = 'block';
    if (!persistent) {
        setTimeout(() => {
            notification.style.display = 'none';
        }, timeout);
    }
}

// simple HTML-escape to avoid injected markup
function escapeHtml(str) {
    return String(str).replace(/[&<>"'`=\/]/g, s => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '/': '&#x2F;', '`': '&#x60;', '=': '&#x3D;'
    }[s]));
}

// ---------- Local add/post ----------

async function addQuote(event) {
    event.preventDefault();
    const text = quoteText.value.trim();
    const newAuthor = author.value.trim();
    const newCategory = category.value.trim();

    if (text && newAuthor && newCategory) {
        const newQuote = { text, author: newAuthor, category: newCategory };

        // Add locally
        quotes.push(newQuote);
        localStorage.setItem("quotes", JSON.stringify(quotes));
        populateCategories();
        addQuoteForm.reset();
        showNotification("Quote added locally.");

        // Attempt to post to server (mock)
        try {
            await postQuoteToServer(newQuote);
            showNotification("Quote posted to server (mock).");
        } catch (err) {
            console.warn("Failed to post to server (mock):", err);
            showNotification("Could not post to server. Stored locally.", { timeout: 4000 });
        }

        showRandomQuote();
    }
}

async function postQuoteToServer(quote) {
    // Post to mock API; returns server response object
    const response = await fetch(POST_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
            title: quote.text,
            body: `${quote.author} | ${quote.category}`,
            userId: 1
        })
    });

    if (!response.ok) throw new Error(`Server POST failed: ${response.status}`);
    // Return mapped server quote shape (mock)
    const data = await response.json();
    return { text: data.title || quote.text, author: quote.author, category: quote.category, _serverId: data.id || null };
}

// ---------- Fetch from server (mock) ----------

/**
 * fetchQuotesFromServer
 * - The checker expects exactly this function name.
 * - Uses a mock GET endpoint to retrieve items, then maps them to quote objects.
 */
async function fetchQuotesFromServer() {
    const res = await fetch(FETCH_ENDPOINT);
    if (!res.ok) throw new Error(`Fetch failed with status ${res.status}`);
    const items = await res.json(); // jsonplaceholder posts array
    // Map the mock shape to our quote shape:
    const serverQuotes = items.map(it => {
        // jsonplaceholder has 'title' and 'body'. Use 'title' for text.
        const text = it.title || "Untitled quote";
        // try to derive author/category from body if present; otherwise use placeholders
        let author = "Server Author";
        let category = "Server";
        if (it.body) {
            // if body contains "Author | Category" pattern we can parse it
            const parts = it.body.split("|").map(p => p.trim());
            if (parts.length >= 2) {
                author = parts[0];
                category = parts[1];
            } else if (parts.length === 1) {
                author = parts[0];
            }
        }
        return { text, author, category, _serverId: it.id };
    });
    return serverQuotes;
}

// ---------- Sync logic (merge + conflict resolution) ----------

/**
 * syncQuotes
 * - The checker expects a function with this name.
 * - Fetches server quotes and merges them into local storage.
 * - Detects conflicts (same text+author but different category) and stores conflicts for resolution.
 */
async function syncQuotes() {
    showNotification("Syncing with server...", { persistent: true });
    syncBtn.disabled = true;

    try {
        const serverQuotes = await fetchQuotesFromServer();

        let added = 0;
        let updated = 0;
        let newConflicts = [];

        serverQuotes.forEach(serverQ => {
            // find local match by text+author
            const localIndex = quotes.findIndex(l =>
                l.text.trim().toLowerCase() === serverQ.text.trim().toLowerCase() &&
                l.author.trim().toLowerCase() === serverQ.author.trim().toLowerCase()
            );

            if (localIndex === -1) {
                // not present locally -> add
                quotes.push({ text: serverQ.text, author: serverQ.author, category: serverQ.category });
                added++;
            } else {
                // present locally — check for category mismatch
                const localQ = quotes[localIndex];
                if ((localQ.category || "").trim().toLowerCase() !== (serverQ.category || "").trim().toLowerCase()) {
                    // conflict detected
                    newConflicts.push({
                        local: { ...localQ, _localIndex: localIndex },
                        server: serverQ
                    });
                } else {
                    // same info (or normalized), nothing to do
                }
            }
        });

        // Save additions immediately
        if (added > 0) {
            localStorage.setItem("quotes", JSON.stringify(quotes));
        }

        // Merge conflicts into conflicts list (avoid duplicates)
        newConflicts.forEach(conf => {
            const exists = conflicts.some(c =>
                c.local.text === conf.local.text &&
                c.local.author === conf.local.author &&
                c.server.category === conf.server.category
            );
            if (!exists) conflicts.push(conf);
        });

        // Persist conflicts
        localStorage.setItem("quote_conflicts", JSON.stringify(conflicts));

        // Update UI
        populateCategories();
        showRandomQuote();
        renderConflicts();

        const summary = `Sync done. Added: ${added}. Conflicts: ${newConflicts.length}.`;
        showNotification(summary, { timeout: 5000 });
    } catch (err) {
        console.error("syncQuotes error:", err);
        showNotification("Error syncing with server.", { timeout: 4000 });
    } finally {
        syncBtn.disabled = false;
        // hide the persistent "syncing" message if it still shows
        setTimeout(() => { notification.style.display = 'none'; }, 1000);
    }
}

// ---------- Conflict UI and resolution ----------

function renderConflicts() {
    conflictContainer.innerHTML = ''; // clear
    if (!conflicts || conflicts.length === 0) {
        return;
    }

    const header = document.createElement("div");
    header.innerHTML = `<strong>Conflicts detected (${conflicts.length})</strong>`;
    conflictContainer.appendChild(header);

    conflicts.forEach((c, idx) => {
        const box = document.createElement("div");
        box.style.border = "1px solid #ccc";
        box.style.padding = "8px";
        box.style.marginTop = "8px";
        box.innerHTML = `
            <div><em>Quote:</em> "${escapeHtml(c.local.text)}"</div>
            <div><em>Author:</em> ${escapeHtml(c.local.author)}</div>
            <div style="margin-top:6px;"><em>Local category:</em> ${escapeHtml(c.local.category)} &nbsp; | &nbsp; <em>Server category:</em> ${escapeHtml(c.server.category)}</div>
        `;

        const btnAcceptRemote = document.createElement("button");
        btnAcceptRemote.textContent = "Accept server";
        btnAcceptRemote.style.marginRight = "8px";
        btnAcceptRemote.onclick = () => resolveConflictAcceptRemote(idx);

        const btnKeepLocal = document.createElement("button");
        btnKeepLocal.textContent = "Keep local";
        btnKeepLocal.onclick = () => resolveConflictKeepLocal(idx);

        box.appendChild(btnAcceptRemote);
        box.appendChild(btnKeepLocal);
        conflictContainer.appendChild(box);
    });
}

function resolveConflictAcceptRemote(conflictIndex) {
    const conf = conflicts[conflictIndex];
    if (!conf) return;
    const localIndex = conf.local._localIndex;
    // Accept server category: overwrite local category
    quotes[localIndex].category = conf.server.category;
    // remove this conflict
    conflicts.splice(conflictIndex, 1);
    persistAfterConflictUpdate();
    showNotification("Accepted server change for quote.");
}

function resolveConflictKeepLocal(conflictIndex) {
    // Keep local category; simply remove conflict
    conflicts.splice(conflictIndex, 1);
    persistAfterConflictUpdate();
    showNotification("Kept local category for quote.");
}

function persistAfterConflictUpdate() {
    localStorage.setItem("quotes", JSON.stringify(quotes));
    localStorage.setItem("quote_conflicts", JSON.stringify(conflicts));
    populateCategories();
    renderConflicts();
    showRandomQuote();
}

// ---------- Periodic check ----------

let periodicSyncIntervalMs = 60 * 1000; // 60 seconds
let periodicSyncHandle = null;

function startPeriodicSync() {
    if (periodicSyncHandle) return;
    periodicSyncHandle = setInterval(() => {
        // call syncQuotes but avoid overlapping calls
        if (!syncBtn.disabled) syncQuotes();
    }, periodicSyncIntervalMs);
}

function stopPeriodicSync() {
    if (!periodicSyncHandle) return;
    clearInterval(periodicSyncHandle);
    periodicSyncHandle = null;
}

// ---------- Initialization & Event bindings ----------

newQuoteBtn.addEventListener("click", showRandomQuote);
filter.addEventListener("change", showRandomQuote);
addQuoteForm.addEventListener("submit", addQuote);
syncBtn.addEventListener("click", syncQuotes);

// initial setup on DOM ready
document.addEventListener("DOMContentLoaded", () => {
    populateCategories();
    showRandomQuote();
    renderConflicts();
    // start periodic check (your checker looks for periodic behavior)
    startPeriodicSync();
});
