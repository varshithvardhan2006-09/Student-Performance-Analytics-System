# Student Performance Analytics System

A teacher-focused analytics platform for uploading one subject at a time, validating student marks, generating rankings, detecting weak students, and exporting reports from MongoDB-backed data.

## What the app does

- Secure teacher login and signup
- Single-subject mark uploads from CSV, Excel, or structured PDF
- Automatic validation for file type, duplicate roll numbers, and mark ranges
- Analytics dashboard with pass/fail, marks distribution, top performers, and weak students
- AI insights with fallback summaries when Groq is not configured
- PDF, Excel, and CSV report downloads
- Upload history and teacher profile pages

## Default demo login

- Email: `demo.teacher@saps.local`
- Password: `Demo@1234`

## Tech stack

- Frontend: HTML, CSS, Vanilla JavaScript, Chart.js
- Backend: Node.js, Express, MongoDB native driver
- Auth: JWT, bcrypt
- Uploads: Multer, csv-parser, xlsx, pdf-parse
- Reports: PDFKit, XLSX
- AI: Groq SDK with safe fallback summaries

## Setup

1. Install backend dependencies:

```powershell
cd "C:\Projects\Student Analytics Performance System\backend"
npm install
```

2. Configure `backend/.env`:

```text
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=student_analytics
MONGODB_USERS_COLLECTION=users
JWT_SECRET=your_jwt_secret_key_here
GROQ_API_KEY=your_groq_api_key_here
DEMO_TEACHER_NAME=Demo Teacher
DEMO_TEACHER_EMAIL=demo.teacher@saps.local
DEMO_TEACHER_PASSWORD=Demo@1234
```

3. Start the backend:

```powershell
cd "C:\Projects\Student Analytics Performance System\backend"
node index.js
```

4. Open the app:

```text
http://localhost:3000/index.html
```

## Deployment

### Backend on Vercel

- Set the project root to the repository root.
- Vercel serves the Express app through `api/[...path].js`.
- Add these environment variables in Vercel:
  - `MONGODB_URI`
  - `MONGODB_DB`
  - `MONGODB_USERS_COLLECTION`
  - `JWT_SECRET`
  - `GROQ_API_KEY`
  - `DEMO_TEACHER_NAME`
  - `DEMO_TEACHER_EMAIL`
  - `DEMO_TEACHER_PASSWORD`

### Frontend on GitHub Pages

- GitHub Pages is published automatically from `.github/workflows/deploy-pages.yml`.
- Add a repository secret named `SAPS_API_BASE_URL` with your deployed Vercel URL, for example `https://your-project.vercel.app`.
- The workflow injects that backend URL into `frontend/site-config.js` during deployment.
- After deployment, the frontend talks to the Vercel backend automatically.

## Key backend routes

- `POST /api/signup`
- `POST /api/login`
- `GET /api/profile`
- `GET /api/profile/stats`
- `POST /api/upload`
- `GET /api/analytics/:uploadId`
- `GET /api/students/:uploadId`
- `GET /api/ai-insights/:uploadId`
- `POST /api/ai-insights/:uploadId`
- `GET /api/reports/:uploadId/pdf`
- `GET /api/reports/:uploadId/excel`
- `GET /api/reports/:uploadId/csv`
- `GET /api/uploads`
- `GET /api/uploads/:id`
- `DELETE /api/uploads/:id`

## Notes

- The app is intentionally light-mode only.
- Uploaded files are processed server-side and stored in MongoDB.
- If Groq is not configured, the dashboard still shows fallback AI summaries.
