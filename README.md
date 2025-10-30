# News Aggregator API

A RESTful API for aggregating and managing news articles with user authentication, preferences, caching, and search functionality.

## Features

- **User Authentication**: JWT-based authentication with bcrypt password hashing
- **User Preferences**: Customizable news categories and language preferences
- **News Aggregation**: Fetches news from NewsAPI based on user preferences
- **Caching**: Intelligent caching mechanism to reduce external API calls
- **Article Management**: Mark articles as read or favorite
- **Search**: Search articles by keyword
- **Periodic Updates**: Background cache updates every 10 minutes

## Prerequisites

- Node.js >= 18.0.0
- npm or pnpm
- NewsAPI key (get one for free at https://newsapi.org/)

## Installation

1. Clone the repository or navigate to the project directory:
```bash
cd news-aggregator-api-nikhiltidke101
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
export NEWS_API_KEY="your-news-api-key-here"
export JWT_SECRET="your-secret-key-here"  # Optional, defaults to 'dev_secret_change_me'
```

4. Start the server:
```bash
node app.js
```

The server will start on port 3000 by default.

## API Endpoints

### Authentication

#### POST /register
Register a new user.

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "SecurePass123"
}
```

**Response:** `201 Created`
```json
{
  "id": 1,
  "name": "John Doe",
  "email": "john@example.com"
}
```

**Validation:**
- Name: 2-100 characters, non-empty string
- Email: Valid email format
- Password: 8-128 characters

#### POST /login
Login and receive JWT token.

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "SecurePass123"
}
```

**Response:** `200 OK`
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### User Preferences

#### GET /preferences
Get user's news preferences.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "categories": ["technology", "science"],
  "languages": ["en", "es"]
}
```

#### PUT /preferences
Update user's news preferences.

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "categories": ["technology", "science", "business"],
  "languages": ["en"]
}
```

**Valid Categories:** `business`, `entertainment`, `general`, `health`, `science`, `sports`, `technology`

**Valid Languages:** `en`, `es`, `fr`, `de`, `it`, `pt`, `ja`, `ko`, `zh`, `ar`, `hi`, `ru`

**Response:** `200 OK`
```json
{
  "categories": ["technology", "science", "business"],
  "languages": ["en"]
}
```

### News Articles

#### GET /news
Get news articles based on user preferences.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "articles": [
    {
      "id": "article_id_123",
      "title": "Article Title",
      "description": "Article description",
      "url": "https://example.com/article",
      "urlToImage": "https://example.com/image.jpg",
      "publishedAt": "2024-01-01T00:00:00Z",
      "source": "News Source",
      "isRead": false,
      "isFavorite": false
    }
  ],
  "total": 20,
  "fromCache": true,
  "filters": {
    "country": "us",
    "category": "technology",
    "userPreferences": {
      "categories": ["technology"],
      "languages": ["en"]
    }
  }
}
```

#### GET /news/search/:keyword
Search for articles by keyword.

**Headers:**
```
Authorization: Bearer <token>
```

**Parameters:**
- `keyword`: Search term (in URL path)

**Response:** `200 OK`
```json
{
  "articles": [...],
  "total": 5,
  "keyword": "technology"
}
```

#### POST /news/:id/read
Mark an article as read.

**Headers:**
```
Authorization: Bearer <token>
```

**Parameters:**
- `id`: Article ID (in URL path)

**Response:** `200 OK`
```json
{
  "message": "Article marked as read",
  "articleId": "article_id_123"
}
```

#### POST /news/:id/favorite
Mark an article as favorite.

**Headers:**
```
Authorization: Bearer <token>
```

**Parameters:**
- `id`: Article ID (in URL path)

**Response:** `200 OK`
```json
{
  "message": "Article marked as favorite",
  "articleId": "article_id_123"
}
```

#### GET /news/read
Get all read articles.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "articles": [...],
  "total": 10
}
```

#### GET /news/favorites
Get all favorite articles.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "articles": [...],
  "total": 5
}
```

## Error Responses

All endpoints return appropriate HTTP status codes:

- `400 Bad Request`: Invalid input data
- `401 Unauthorized`: Missing or invalid authentication token
- `409 Conflict`: User already exists (registration)
- `500 Internal Server Error`: Server error
- `502 Bad Gateway`: News API error

Error responses include an error message:
```json
{
  "error": "Error description",
  "details": "Additional details (if available)"
}
```

## Caching

The API implements intelligent caching:

- **Cache TTL**: 5 minutes
- **Background Updates**: Cache is automatically updated every 10 minutes
- **Stale Cache Fallback**: If NewsAPI fails, stale cache is used when available
- **Cache Key**: Based on country and category combination

## Security

- Passwords are hashed using bcrypt (10 rounds)
- JWT tokens expire after 1 hour
- Input validation on all endpoints
- Secure error handling (no sensitive data leakage)

## Testing

Run the test suite:
```bash
npm test
```

## Example Usage with cURL

1. Register a user:
```bash
curl -X POST http://localhost:3000/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com","password":"SecurePass123"}'
```

2. Login:
```bash
TOKEN=$(curl -s -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"SecurePass123"}' \
  | grep -o '"token":"[^"]*' | cut -d'"' -f4)

echo "Token: $TOKEN"
```

3. Set preferences:
```bash
curl -X PUT http://localhost:3000/preferences \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"categories":["technology","science"],"languages":["en"]}'
```

4. Get news:
```bash
curl -X GET http://localhost:3000/news \
  -H "Authorization: Bearer $TOKEN"
```

5. Mark article as read:
```bash
curl -X POST http://localhost:3000/news/article_id_123/read \
  -H "Authorization: Bearer $TOKEN"
```

6. Search articles:
```bash
curl -X GET http://localhost:3000/news/search/technology \
  -H "Authorization: Bearer $TOKEN"
```

## Project Structure

```
news-aggregator-api-nikhiltidke101/
├── app.js                 # Main application file
├── controllers/           # Controller files (future use)
├── middleware/           # Middleware files (future use)
├── models/               # Model files (future use)
├── test/                 # Test files
│   └── server.test.js    # Test suite
├── package.json          # Dependencies and scripts
└── README.md            # This file
```

## Notes

- User data, articles cache, and read/favorite tracking are stored in-memory (will be cleared on server restart)
- For production use, integrate with a persistent database (PostgreSQL, MongoDB, etc.)
- The `/users/signup` endpoint is retained for backward compatibility but is not recommended for use

## License

ISC
