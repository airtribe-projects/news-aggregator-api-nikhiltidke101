const express = require("express");
const app = express();
const port = 3000;
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const axios = require("axios");

// In-memory user store for demo purposes
// User shape: { id, name, email, passwordHash, preferences, readArticles, favoriteArticles }
const users = [];
let nextUserId = 1;

// Cache for news articles
// Cache structure: { cacheKey: { articles: [], timestamp: Date, expiresAt: Date } }
const newsCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

// Helper function to generate cache key
function getCacheKey(country, category) {
  return `${country}_${category}`;
}

// Helper function to check if cache entry is valid
function isCacheValid(cacheEntry) {
  if (!cacheEntry || !cacheEntry.expiresAt) {
    return false;
  }
  return new Date() < cacheEntry.expiresAt;
}

// Helper function to fetch news from NewsAPI
async function fetchNewsFromAPI(country, category, newsApiKey) {
  const newsApiUrl = "https://newsapi.org/v2/top-headlines";
  const params = {
    country: country,
    category: category,
    pageSize: 20,
    apiKey: newsApiKey,
  };

  const response = await axios.get(newsApiUrl, { params, timeout: 10000 });
  const responseData = response.data;

  if (responseData.status === "ok" && responseData.articles) {
    return responseData.articles
      .filter((article) => article.title && article.url)
      .map((article) => ({
        id: `${article.url}_${article.publishedAt}`
          .replace(/[^a-zA-Z0-9]/g, "_")
          .substring(0, 100),
        title: article.title,
        description: article.description,
        url: article.url,
        urlToImage: article.urlToImage,
        publishedAt: article.publishedAt,
        source: article.source?.name || "Unknown",
      }));
  }
  throw new Error(responseData.message || "Invalid response from news API");
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Validation helper functions
function validateEmail(email) {
  if (typeof email !== "string" || !email.trim()) {
    return { valid: false, error: "Email must be a non-empty string" };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, error: "Invalid email format" };
  }
  return { valid: true };
}

function validatePassword(password) {
  if (typeof password !== "string") {
    return { valid: false, error: "Password must be a string" };
  }
  if (password.length < 8) {
    return {
      valid: false,
      error: "Password must be at least 8 characters long",
    };
  }
  if (password.length > 128) {
    return {
      valid: false,
      error: "Password must be no more than 128 characters long",
    };
  }
  return { valid: true };
}

function validateName(name) {
  if (typeof name !== "string" || !name.trim()) {
    return { valid: false, error: "Name must be a non-empty string" };
  }
  if (name.trim().length < 2) {
    return { valid: false, error: "Name must be at least 2 characters long" };
  }
  if (name.trim().length > 100) {
    return {
      valid: false,
      error: "Name must be no more than 100 characters long",
    };
  }
  return { valid: true };
}

function validateCategories(categories) {
  if (!Array.isArray(categories)) {
    return { valid: false, error: "Categories must be an array" };
  }
  const validCategories = [
    "business",
    "entertainment",
    "general",
    "health",
    "science",
    "sports",
    "technology",
  ];
  for (const cat of categories) {
    if (typeof cat !== "string") {
      return { valid: false, error: "All categories must be strings" };
    }
    if (!validCategories.includes(cat.toLowerCase())) {
      return {
        valid: false,
        error: `Invalid category: ${cat}. Valid categories are: ${validCategories.join(
          ", "
        )}`,
      };
    }
  }
  return { valid: true };
}

function validateLanguages(languages) {
  if (!Array.isArray(languages)) {
    return { valid: false, error: "Languages must be an array" };
  }
  const validLanguages = [
    "en",
    "es",
    "fr",
    "de",
    "it",
    "pt",
    "ja",
    "ko",
    "zh",
    "ar",
    "hi",
    "ru",
  ];
  for (const lang of languages) {
    if (typeof lang !== "string") {
      return { valid: false, error: "All languages must be strings" };
    }
    if (!validLanguages.includes(lang.toLowerCase())) {
      return {
        valid: false,
        error: `Invalid language: ${lang}. Valid languages are: ${validLanguages.join(
          ", "
        )}`,
      };
    }
  }
  return { valid: true };
}

// Auth middleware for protected routes
function authenticate(req, res, next) {
  try {
    const authHeader = req.headers["authorization"];
    if (!authHeader) {
      return res.status(401).json({
        error: "Unauthorized",
        message:
          "Authorization header is required. Format: Authorization: Bearer <token>",
      });
    }

    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      return res.status(401).json({
        error: "Unauthorized",
        message:
          "Invalid Authorization header format. Expected: Bearer <token>",
      });
    }

    const token = parts[1];
    if (!token || token.trim().length === 0) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Token is missing or empty",
      });
    }

    const secret = process.env.JWT_SECRET || "dev_secret_change_me";
    let payload;
    try {
      payload = jwt.verify(token, secret);
    } catch (jwtError) {
      if (jwtError.name === "TokenExpiredError") {
        return res.status(401).json({
          error: "Unauthorized",
          message: "Token has expired. Please login again.",
        });
      } else if (jwtError.name === "JsonWebTokenError") {
        return res.status(401).json({
          error: "Unauthorized",
          message: "Invalid token signature",
        });
      } else {
        return res.status(401).json({
          error: "Unauthorized",
          message: "Token verification failed",
        });
      }
    }

    const userId = payload && payload.sub;
    if (!userId) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Invalid token: missing user ID",
      });
    }

    const user = users.find((u) => u.id === userId);
    if (!user) {
      return res.status(401).json({
        error: "Unauthorized",
        message:
          "User not found. Token may be invalid or user may have been deleted.",
      });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("Authentication error:", err);
    return res.status(401).json({
      error: "Unauthorized",
      message: "Authentication failed",
    });
  }
}

app.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ error: "name, email, and password are required" });
    }

    const existing = users.find(
      (u) => u.email.toLowerCase() === String(email).toLowerCase()
    );
    if (existing) {
      return res.status(409).json({ error: "User already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = {
      id: nextUserId++,
      name,
      email,
      passwordHash,
      preferences: { categories: [], languages: [] },
      readArticles: new Set(), // Store article IDs
      favoriteArticles: new Set(), // Store article IDs
    };
    users.push(user);

    return res
      .status(201)
      .json({ id: user.id, name: user.name, email: user.email });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Preferences - protected routes
app.get("/preferences", authenticate, (req, res) => {
  const { preferences } = req.user;
  return res.status(200).json(preferences || { categories: [], languages: [] });
});

app.put("/preferences", authenticate, (req, res) => {
  const { categories, languages } = req.body || {};

  if (categories !== undefined && !Array.isArray(categories)) {
    return res
      .status(400)
      .json({ error: "categories must be an array of strings" });
  }
  if (languages !== undefined && !Array.isArray(languages)) {
    return res
      .status(400)
      .json({ error: "languages must be an array of strings" });
  }

  const user = req.user;
  user.preferences = user.preferences || { categories: [], languages: [] };
  if (categories !== undefined) user.preferences.categories = categories;
  if (languages !== undefined) user.preferences.languages = languages;

  return res.status(200).json(user.preferences);
});

// Helper function to map language codes to country codes for NewsAPI
function getCountryFromLanguage(lang) {
  const langToCountry = {
    en: "us",
    es: "es",
    fr: "fr",
    de: "de",
    it: "it",
    pt: "pt",
    ja: "jp",
    ko: "kr",
    zh: "cn",
    ar: "ae",
    hi: "in",
    ru: "ru",
  };
  return langToCountry[lang.toLowerCase()] || "us";
}

// News endpoint - fetches articles based on user preferences
app.get("/news", authenticate, async (req, res) => {
  try {
    const newsApiKey = process.env.NEWS_API_KEY;
    if (!newsApiKey) {
      return res
        .status(500)
        .json({
          error:
            "News API key not configured. Please set NEWS_API_KEY environment variable.",
        });
    }

    const user = req.user;
    const preferences = user.preferences || { categories: [], languages: [] };
    const categories = preferences.categories || [];
    const languages = preferences.languages || [];

    // NewsAPI accepts country codes (2 letters) for country parameter
    // We'll use the first language preference or default to 'us'
    const country =
      languages.length > 0 ? getCountryFromLanguage(languages[0]) : "us";

    // NewsAPI category options: business, entertainment, general, health, science, sports, technology
    const newsApiCategories = [
      "business",
      "entertainment",
      "general",
      "health",
      "science",
      "sports",
      "technology",
    ];
    const validCategories = categories.filter((cat) =>
      newsApiCategories.includes(cat.toLowerCase())
    );

    // If user has no categories, fetch general headlines
    const category =
      validCategories.length > 0 ? validCategories[0] : "general";

    // Check cache first
    const cacheKey = getCacheKey(country, category);
    let articles = [];
    let fromCache = false;

    const cachedData = newsCache.get(cacheKey);
    if (isCacheValid(cachedData)) {
      // Use cached data
      articles = cachedData.articles;
      fromCache = true;
    } else {
      // Fetch from API
      try {
        articles = await fetchNewsFromAPI(country, category, newsApiKey);

        // Store in cache
        const expiresAt = new Date(Date.now() + CACHE_TTL);
        newsCache.set(cacheKey, {
          articles: articles,
          timestamp: new Date(),
          expiresAt: expiresAt,
        });
      } catch (axiosError) {
        // If API fails and we have stale cache, use it
        if (
          cachedData &&
          cachedData.articles &&
          cachedData.articles.length > 0
        ) {
          articles = cachedData.articles;
          fromCache = true;
          console.log("Using stale cache due to API error");
        } else {
          // Handle axios errors
          if (axiosError.response) {
            // NewsAPI returned an error response
            const status = axiosError.response.status;
            const errorData = axiosError.response.data;

            if (status === 401 || status === 403) {
              return res.status(502).json({
                error: "News API authentication failed",
                details: errorData.message || "Invalid API key",
              });
            } else if (status === 429) {
              return res.status(502).json({
                error: "News API rate limit exceeded",
                details: "Too many requests. Please try again later.",
              });
            } else if (status >= 500) {
              return res.status(502).json({
                error: "News API server error",
                details:
                  errorData.message || "External API is currently unavailable",
              });
            } else {
              return res.status(502).json({
                error: "News API request failed",
                details: errorData.message || `HTTP ${status} error`,
              });
            }
          } else if (axiosError.request) {
            // Request was made but no response received
            return res.status(502).json({
              error: "News API request timeout",
              details:
                "The news service did not respond in time. Please try again later.",
            });
          } else {
            // Error setting up the request
            return res.status(500).json({
              error: "Failed to fetch news",
              details: axiosError.message || "Internal server error",
            });
        }
      }
    }

    // Ensure user has readArticles and favoriteArticles Sets
    if (!user.readArticles) user.readArticles = new Set();
    if (!user.favoriteArticles) user.favoriteArticles = new Set();

    // Mark articles with read/favorite status for this user
    const articlesWithStatus = articles.map((article) => ({
      ...article,
      isRead: user.readArticles.has(article.id),
      isFavorite: user.favoriteArticles.has(article.id),
    }));

    return res.status(200).json({
      articles: articlesWithStatus,
      total: articlesWithStatus.length,
      fromCache: fromCache,
      filters: {
        country: country,
        category: category,
        userPreferences: {
          categories: categories,
          languages: languages,
        },
      },
    });
  } catch (err) {
    // Catch any unexpected errors
    console.error("Unexpected error in /news endpoint:", err);
    return res.status(500).json({
      error: "Internal server error",
      details: "An unexpected error occurred while fetching news",
    });
  }
});

// Helper function to get all articles from cache
function getAllCachedArticles() {
  const allArticles = [];
  for (const [, cacheEntry] of newsCache.entries()) {
    if (cacheEntry.articles) {
      allArticles.push(...cacheEntry.articles);
    }
  }
  // Remove duplicates based on article ID
  const uniqueArticles = new Map();
  for (const article of allArticles) {
    if (!uniqueArticles.has(article.id)) {
      uniqueArticles.set(article.id, article);
    }
  }
  return Array.from(uniqueArticles.values());
}

// Mark article as read
app.post("/news/:id/read", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    if (!user.readArticles) user.readArticles = new Set();
    user.readArticles.add(id);

    return res.status(200).json({
      message: "Article marked as read",
      articleId: id,
    });
  } catch (err) {
    console.error("Error marking article as read:", err);
    return res.status(500).json({
      error: "Internal server error",
      details: "Failed to mark article as read",
    });
  }
});

// Mark article as favorite
app.post("/news/:id/favorite", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    if (!user.favoriteArticles) user.favoriteArticles = new Set();
    user.favoriteArticles.add(id);

    return res.status(200).json({
      message: "Article marked as favorite",
      articleId: id,
    });
  } catch (err) {
    console.error("Error marking article as favorite:", err);
    return res.status(500).json({
      error: "Internal server error",
      details: "Failed to mark article as favorite",
    });
  }
});

// Get all read articles
app.get("/news/read", authenticate, async (req, res) => {
  try {
    const user = req.user;

    if (!user.readArticles || user.readArticles.size === 0) {
      return res.status(200).json({
        articles: [],
        total: 0,
      });
    }

    const allArticles = getAllCachedArticles();
    const readArticles = allArticles.filter((article) =>
      user.readArticles.has(article.id)
    );

    // Mark favorites as well
    const readArticlesWithStatus = readArticles.map((article) => ({
      ...article,
      isRead: true,
      isFavorite: user.favoriteArticles && user.favoriteArticles.has(article.id),
    }));

    return res.status(200).json({
      articles: readArticlesWithStatus,
      total: readArticlesWithStatus.length,
    });
  } catch (err) {
    console.error("Error fetching read articles:", err);
    return res.status(500).json({
      error: "Internal server error",
      details: "Failed to fetch read articles",
    });
  }
});

// Get all favorite articles
app.get("/news/favorites", authenticate, async (req, res) => {
  try {
    const user = req.user;

    if (!user.favoriteArticles || user.favoriteArticles.size === 0) {
      return res.status(200).json({
        articles: [],
        total: 0,
      });
    }

    const allArticles = getAllCachedArticles();
    const favoriteArticles = allArticles.filter((article) =>
      user.favoriteArticles.has(article.id)
    );

    // Mark read status as well
    const favoriteArticlesWithStatus = favoriteArticles.map((article) => ({
      ...article,
      isRead: user.readArticles && user.readArticles.has(article.id),
      isFavorite: true,
    }));

    return res.status(200).json({
      articles: favoriteArticlesWithStatus,
      total: favoriteArticlesWithStatus.length,
    });
  } catch (err) {
    console.error("Error fetching favorite articles:", err);
    return res.status(500).json({
      error: "Internal server error",
      details: "Failed to fetch favorite articles",
    });
  }
});

// Search articles by keyword
app.get("/news/search/:keyword", authenticate, async (req, res) => {
  try {
    const { keyword } = req.params;
    const user = req.user;

    if (!keyword || keyword.trim().length === 0) {
      return res.status(400).json({
        error: "Keyword is required",
      });
    }

    const searchTerm = keyword.trim().toLowerCase();
    const allArticles = getAllCachedArticles();

    // Search in title and description
    const matchingArticles = allArticles.filter((article) => {
      const title = (article.title || "").toLowerCase();
      const description = (article.description || "").toLowerCase();
      return title.includes(searchTerm) || description.includes(searchTerm);
    });

    // Ensure user has readArticles and favoriteArticles Sets
    if (!user.readArticles) user.readArticles = new Set();
    if (!user.favoriteArticles) user.favoriteArticles = new Set();

    // Mark articles with read/favorite status
    const articlesWithStatus = matchingArticles.map((article) => ({
      ...article,
      isRead: user.readArticles.has(article.id),
      isFavorite: user.favoriteArticles.has(article.id),
    }));

    return res.status(200).json({
      articles: articlesWithStatus,
      total: articlesWithStatus.length,
      keyword: keyword,
    });
  } catch (err) {
    console.error("Error searching articles:", err);
    return res.status(500).json({
      error: "Internal server error",
      details: "Failed to search articles",
    });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const user = users.find(
      (u) => u.email.toLowerCase() === String(email).toLowerCase()
    );
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const secret = process.env.JWT_SECRET || "dev_secret_change_me";
    const token = jwt.sign({ sub: user.id, email: user.email }, secret, {
      expiresIn: "1h",
    });
    return res.status(200).json({ token });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Periodic cache update function
async function updateCachePeriodically() {
  const newsApiKey = process.env.NEWS_API_KEY;
  if (!newsApiKey) {
    console.log("Skipping cache update: NEWS_API_KEY not configured");
    return;
  }

  console.log("Starting periodic cache update...");
  const updateInterval = 10 * 60 * 1000; // 10 minutes

  // Common categories and countries to cache
  const categories = ["general", "technology", "science", "business", "sports"];
  const countries = ["us", "gb", "in", "au", "ca"];

  async function updateCache() {
    try {
      const promises = [];
      for (const country of countries) {
        for (const category of categories) {
          promises.push(
            fetchNewsFromAPI(country, category, newsApiKey)
              .then((articles) => {
                const cacheKey = getCacheKey(country, category);
                const expiresAt = new Date(Date.now() + CACHE_TTL);
                newsCache.set(cacheKey, {
                  articles: articles,
                  timestamp: new Date(),
                  expiresAt: expiresAt,
                });
                console.log(
                  `Updated cache for ${country}_${category}: ${articles.length} articles`
                );
              })
              .catch((err) => {
                console.error(
                  `Failed to update cache for ${country}_${category}:`,
                  err.message
                );
              })
          );
        }
      }
      await Promise.all(promises);
      console.log("Cache update completed");
    } catch (err) {
      console.error("Error during cache update:", err);
    }
  }

  // Initial cache update after 1 minute
  setTimeout(updateCache, 60 * 1000);

  // Then update every 10 minutes
  setInterval(updateCache, updateInterval);
}

app.listen(port, (err) => {
  if (err) {
    return console.log("Something bad happened", err);
  }
  console.log(`Server is listening on ${port}`);
  
  // Start periodic cache updates
  updateCachePeriodically();
});

// Existing sample route retained but not recommended for use
app.post("/users/signup", (req, res) => {
  const user = {
    id: 1,
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
  };
  res.status(201).json(user);
});

module.exports = app;
