let quotes = JSON.parse(localStorage.getItem("quotes")) || [
    { text: "The best way to get started is to quit talking and begin doing.", author: "Walt Disney", category: "Server" },
    { text: "Life is what happens when you're busy making other plans.", author: "John Lennon", category: "Local" },
    { text: "Don’t let yesterday take up too much of today.", author: "Will Rogers", category: "Motivation" }
];

const quoteContainer = document.getElementById("quote-container");
const notification = document.getElementById("notification");
const filter = document.getElementById("filter");
const newQuoteBtn = document.getElementById("new-quote-btn");
const syncBtn = document.getElementById("sync-btn");
const addQuoteForm = document.getElementById("add-quote-form");
const quoteText = document.getElementById("quote-text");
const author = document.getElementById("author");
const category = document.getElementById("category");

// Show a random quote from the filtered list
function showRandomQuote() {
    const selectedCategory = filter.value;
    const filteredQuotes = (selectedCategory === "All") ? quotes : quotes.filter(q => q.category === selectedCategory);

    if (filteredQuotes.length > 0) {
        const randomIndex = Math.floor(Math.random() * filteredQuotes.length);
        const quote = filteredQuotes[randomIndex];
        quoteContainer.innerHTML = '';
        const newQuoteElement = document.createElement('div');
        newQuoteElement.innerHTML = `<p>"${quote.text}"</p><p>— ${quote.author} (${quote.category})</p>`;
        quoteContainer.appendChild(newQuoteElement);
    } else {
        quoteContainer.innerHTML = '<p>No quotes available for this category.</p>';
    }
}

// Populate the filter dropdown with unique categories
function populateCategories() {
    const categories = [...new Set(quotes.map(q => q.category))];
    filter.innerHTML = '<option value="All">All</option>';
    categories.forEach(category => {
        const option = document.createElement("option");
        option.value = category;
        option.textContent = category;
        filter.appendChild(option);
    });
}

// Add a new quote from the form
function addQuote(event) {
    event.preventDefault();
    const text = quoteText.value.trim();
    const newAuthor = author.value.trim();
    const newCategory = category.value.trim();

    if (text && newAuthor && newCategory) {
        quotes.push({ text: text, author: newAuthor, category: newCategory });
        localStorage.setItem("quotes", JSON.stringify(quotes));
        populateCategories();
        addQuoteForm.reset();
        showNotification("Quote added successfully!");
        showRandomQuote();
    }
}

// Show temporary notification
function showNotification(message) {
    notification.textContent = message;
    notification.style.display = 'block';
    setTimeout(() => {
        notification.style.display = 'none';
    }, 3000);
}

// Fetch quotes from server and sync (Placeholder function)
async function syncWithServer() {
    showNotification("Syncing with server...");
    try {
        const serverQuotes = await fetchServerQuotes();
        const newQuotes = serverQuotes.filter(serverQuote =>
            !quotes.some(localQuote => localQuote.text === serverQuote.text && localQuote.author === serverQuote.author));

        if (newQuotes.length > 0) {
            quotes = [...quotes, ...newQuotes];
            localStorage.setItem("quotes", JSON.stringify(quotes));
            populateCategories();
            showRandomQuote();
            showNotification(`Synced! Added ${newQuotes.length} new quotes.`);
        } else {
            showNotification("No new quotes from server.");
        }
    } catch (error) {
        console.error("Failed to sync with server:", error);
        showNotification("Error syncing with server.");
    }
}

// Placeholder for a function to fetch quotes from a server
function fetchServerQuotes() {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve([
                { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt", category: "Inspiration" },
            ]);
        }, 1000);
    });
}

// Event listeners
newQuoteBtn.addEventListener("click", showRandomQuote);
filter.addEventListener("change", showRandomQuote);
addQuoteForm.addEventListener("submit", addQuote);
syncBtn.addEventListener("click", syncWithServer);

// Initial setup
document.addEventListener("DOMContentLoaded", () => {
    populateCategories();
    showRandomQuote();
});
