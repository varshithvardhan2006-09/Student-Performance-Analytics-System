<div align="center">

# Student Performance Analytics System

**Turn a marks spreadsheet into a performance dashboard in one upload.**

![License](https://img.shields.io/badge/License-MIT-blue)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-5%2B-47A248?logo=mongodb&logoColor=white)
![CI](https://github.com/varshithvardhan2006-09/Student-Performance-Analytics-System/actions/workflows/ci.yml/badge.svg)

</div>

---

## Overview

Teachers usually keep marks in spreadsheets. This app reads a marks file and shows what matters: who passed, who failed, the class average, the top performers, the students who need help, and how each subject went.

A teacher signs up, uploads a CSV, Excel or text-based PDF file (one subject or many), and the server checks every row before saving anything. Results are stored in MongoDB, so any earlier upload can be reopened from the history page. One Express server serves both the API and the frontend, so the whole project starts with a single command.

| | |
|---|---|
| **Who it is for** | Teachers and academic staff |
| **Input** | CSV, Excel (`.xlsx`, `.xls`) or text-based PDF marks files |
| **Output** | Dashboard, insights, and PDF, Excel and CSV reports |
| **Runs on** | Node.js 18+ and MongoDB 5+ |

---

## Presentation

There is no slide deck in this repository. The project is presented through its documents.

| Document | What it covers |
|---|---|
| [Software requirements (SRS)](docs/SRS.md) | Scope, users, requirements and data model |
| [Architecture diagram](docs/diagrams/architecture.svg) | How the parts fit together |
| [Use case diagram](docs/diagrams/use-case.svg) | What a teacher can do |
| [ER diagram](docs/diagrams/er-diagram.svg) | The seven MongoDB collections |
| [Upload sequence](docs/diagrams/sequence-upload.svg) | What happens when a file is uploaded |

Every diagram also has a Mermaid source (`.mmd`) and a PNG export in the same folder.

---

## Screenshots

*Captured from the live app, running locally with the files in [`docs/sample-data`](docs/sample-data).*

<table>
  <tr>
    <td width="50%"><b>Login</b><br><img src="docs/screenshots/01-login.png" alt="Login screen"></td>
    <td width="50%"><b>Upload</b><br><img src="docs/screenshots/02-upload.png" alt="Upload page"></td>
  </tr>
  <tr>
    <td width="50%"><b>Dashboard</b><br><img src="docs/screenshots/03-dashboard.png" alt="Analytics dashboard"></td>
    <td width="50%"><b>AI Insights</b><br><img src="docs/screenshots/04-insights.png" alt="AI insights page"></td>
  </tr>
  <tr>
    <td colspan="2"><b>Upload history</b><br><img src="docs/screenshots/05-history.png" alt="Upload history"></td>
  </tr>
</table>

---

## Features

| Area | What you get |
|---|---|
| **Accounts** | Teacher signup and login, bcrypt password hashing, JWT sessions |
| **Uploads** | CSV, Excel and text PDF, up to 10 MB per file, several files at once, file signature checks |
| **Validation** | Missing columns, duplicate roll numbers, non-numeric, negative and too-high marks, each reported with its row number |
| **Analytics** | Totals, pass and fail counts, pass percentage, average, highest and lowest marks, distribution bands, ranking, categories, subject-wise summary |
| **Dashboard** | Charts, subject and student filters, searchable student table |
| **Questions** | Ask about the data in plain English and get an answer from the stored records |
| **Insights** | AI-written insights, with a built-in fallback when no AI key is set |
| **Reports** | Download PDF, Excel or CSV |
| **History** | Reopen or delete any earlier upload |

---

## Architecture

<p align="center">
  <img src="docs/diagrams/architecture.svg" alt="System architecture" width="85%">
</p>

1. The teacher opens `http://localhost:3000`. Express serves the static frontend from `frontend/`.
2. The frontend calls the API under `/api/*` and sends its JWT in the `Authorization` header.
3. The backend checks the token, the uploaded file and every record.
4. Clean records and calculated analytics are saved to MongoDB.
5. The dashboard, insights, reports and history all read from the stored data.
6. Groq is optional. Without a key, local fallbacks keep everything working.

<details>
<summary><b>Project structure</b></summary>

```
Student-Performance-Analytics-System/
├── .github/workflows/ci.yml        lint and tests on every push
├── .vscode/                        shared editor, debug and task settings
├── backend/
│   ├── index.js                    Express startup, middleware, routes, static files
│   ├── package.json
│   ├── .env.example                environment template (no secrets)
│   ├── src/
│   │   ├── config/env.js           environment loading and validation
│   │   ├── db/connection.js        MongoDB connection, indexes, demo user
│   │   ├── middleware/             auth, CORS, rate limits, security headers, uploads
│   │   ├── routes/                 health, auth, upload, analytics, students, AI, reports, uploads
│   │   ├── services/               parsing, validation, analytics, query engine, AI
│   │   └── utils/                  validators and normalizers
│   └── tests/                      Node test suite
├── frontend/
│   ├── index.html                  single-page app shell
│   ├── privacy.html, terms.html    policy pages
│   ├── style.css, script.js, favicon.svg
│   └── src/                        api, charts, pages, utils, state, shell, selectors
├── docs/                           SRS, diagrams, screenshots, sample data
├── eslint.config.mjs
└── LICENSE
```

</details>

---

## Dataset

There is no fixed dataset. Each teacher uploads their own marks file. The files in [`docs/sample-data`](docs/sample-data) show the expected shape, and they contain made-up placeholder names, not real students.

| Type | Columns | Sample |
|---|---|---|
| Single subject | `Roll No`, `Student Name`, `Marks` | [single-subject.csv](docs/sample-data/single-subject.csv) |
| Multiple subjects | `Roll No`, `Student Name`, then one numeric column per subject | [multi-subject.csv](docs/sample-data/multi-subject.csv) |

Column names are matched loosely, so `Roll`, `Name` or `Score` also work.

**Rules applied to every file**

- The file is not empty and the required columns are present.
- Roll numbers are unique.
- Marks are numbers from 0 up to the maximum marks entered on the upload form.
- Passing marks are above 0 and not above the maximum marks.

**How results are decided**

| Case | Rule |
|---|---|
| Single subject | Pass at or above the passing marks |
| Multiple subjects | Pass only by reaching the passing marks in every subject. The overall mark is the average of the subjects |
| Categories | Failed, Top Performer (above 80%), Weak Student (passed but below 40%), Average Performer |

**What is stored:** `users`, `subjects`, `uploads`, `students`, `analytics`, `aiInsights` and `reports`. See the [ER diagram](docs/diagrams/er-diagram.svg).

---

## Data sources

| Source | Used for |
|---|---|
| **Marks files** uploaded by the teacher | The only source of student data. Files are read in memory and not kept on disk |
| **MongoDB** (local or Atlas) | Storing processed records, analytics, insights and report history |
| **Groq** (optional) | Insight text, answers the built-in engine cannot give, and help reading PDF text. Only used when `GROQ_API_KEY` is set |

No external datasets, scraped data or third-party student data are used.

---

## Tech stack

| Layer | Technology |
|---|---|
| **Frontend** | HTML5, CSS3, JavaScript ES modules, Chart.js 4.4.7 (pinned, with an integrity hash) |
| **Backend** | Node.js 18+, Express 5, jsonwebtoken, bcryptjs, multer, csv-parser, xlsx, pdf-parse, pdfkit, Groq SDK |
| **Database** | MongoDB 5+ with the native driver, local or Atlas |
| **Tooling** | ESLint 9, `node --test`, GitHub Actions |

---

## Run locally

**You need** Node.js 18 or newer, MongoDB 5 or newer (or an Atlas connection string) and Git.

```bash
git clone https://github.com/varshithvardhan2006-09/Student-Performance-Analytics-System.git
cd Student-Performance-Analytics-System/backend
npm install
cp .env.example .env
```

Set `JWT_SECRET` in `backend/.env` to a long random value:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Then start the app and open **http://localhost:3000**:

```bash
npm start
```

If MongoDB is installed locally but not running, the server tries to start it in development. For local demos a teacher account (`demo.teacher@saps.local`, password from `DEMO_TEACHER_PASSWORD`) is created automatically. It is never created when `NODE_ENV=production`.

<details>
<summary><b>Environment variables</b></summary>

| Variable | Required | Purpose |
|---|:---:|---|
| `JWT_SECRET` | Yes | Secret that signs login tokens. Use 32 or more random characters |
| `PORT` | No | Server port, default `3000` |
| `MONGODB_URI` | No | Connection string, default `mongodb://127.0.0.1:27017` |
| `MONGODB_DB` | No | Database name, default `student_analytics` |
| `MONGODB_USERS_COLLECTION` | No | Users collection name |
| `MONGODB_TIMEOUT_MS` | No | Connection timeout |
| `GROQ_API_KEY` | No | Turns on AI-written insights |
| `ALLOWED_ORIGINS` | Production | Comma-separated browser origins allowed by CORS |
| `FRONTEND_URL` | No | One more allowed origin |
| `JSON_LIMIT` | No | Maximum JSON body size, default `2mb` |
| `TRUST_PROXY` | No | Number of reverse proxies in front of the app, so rate limiting sees real client IPs |
| `DEMO_TEACHER_*` | No | Name, email and password of the local demo account |

Never commit `backend/.env`.

</details>

<details>
<summary><b>Scripts</b> (run from <code>backend/</code>)</summary>

| Command | Purpose |
|---|---|
| `npm start` | Start the server and serve the frontend |
| `npm run dev` | Start with nodemon |
| `npm test` | Run the tests |
| `npm run test:syntax` | Syntax check of the entry files |
| `npm run lint` | ESLint for backend and frontend |
| `npm run lint:fix` | Fix what ESLint can fix |

There is no build step. The frontend is served as it is.

</details>

---

## API & AI

### API

Protected routes need `Authorization: Bearer <token>`.

| Method | Route | Auth | Purpose |
|---|---|:---:|---|
| `GET` | `/api/health` | No | Server and database status |
| `POST` | `/api/signup` | No | Register a teacher |
| `POST` | `/api/login` | No | Log in and receive a token |
| `GET` | `/api/profile` | Yes | Current teacher |
| `GET` | `/api/profile/stats` | Yes | Upload and report counts |
| `POST` | `/api/upload` | Yes | Upload and process marks files |
| `GET` | `/api/analytics/:uploadId` | Yes | Stored analytics |
| `GET` | `/api/analytics/:uploadId/filtered` | Yes | Analytics for a subject or student (`?subject=`, `?student=`) |
| `GET` | `/api/students/:uploadId` | Yes | Students, with search, status, category and paging |
| `POST` | `/api/ai-insights/:uploadId` | Yes | Generate insights |
| `GET` | `/api/ai-insights/:uploadId` | Yes | Saved insights, or `null` if none yet |
| `POST` | `/api/ai-query/:uploadId` | Yes | Ask a question about the data |
| `GET` | `/api/reports/:uploadId/pdf` | Yes | PDF report |
| `GET` | `/api/reports/:uploadId/excel` | Yes | Excel report |
| `GET` | `/api/reports/:uploadId/csv` | Yes | CSV report |
| `GET` | `/api/uploads` | Yes | Upload history (paged) |
| `GET` | `/api/uploads/:id` | Yes | One upload with its analytics |
| `DELETE` | `/api/uploads/:id` | Yes | Delete an upload and everything linked to it |

Errors return `{ "success": false, "message": "..." }` with a matching status code. Upload validation errors also include an `errors` list.

### AI

- **Insights** use Groq (`llama-3.1-8b-instant`) when `GROQ_API_KEY` is set. If the key is missing or the call fails, template-written insights are used instead.
- **Questions** go to a rule-based engine first (`backend/src/services/queryEngine.js`). It understands things like "how many students failed", "who is the topper", "average in Physics", "between 40 and 60" or a student's name or roll number, and needs no AI call. Only questions it cannot answer go to Groq, and off-topic questions are refused.
- **PDF files** can be read with the help of Groq. If that fails, the local PDF parser is used.
- **What leaves your server:** only summary figures, the question, or PDF text, and only when a Groq key is set. Questions are cleaned before they reach a prompt.
- **No machine learning model** is trained or used. Results come from fixed rules: percentages, pass marks, category bands and ranking by marks.

---

## Security

| Area | What is done |
|---|---|
| **Passwords** | bcrypt with 12 rounds. Signup needs 8 to 72 bytes |
| **Sessions** | Signed JWTs that expire after 7 days. Every query is limited to the logged-in teacher's data |
| **Production safety** | The server refuses to start without a strong `JWT_SECRET`. The demo account is never created |
| **Rate limiting** | Login, signup and upload routes. Uses the real connection address and only trusts forwarded headers when `TRUST_PROXY` is set |
| **Uploads** | Checked by extension and file signature, limited to 10 MB, kept in memory |
| **Input** | Student search is plain text, not a pattern. Malformed IDs return 400 |
| **Headers** | Security headers on every response, including a Content-Security-Policy |
| **CORS** | Only the origins you configure |
| **Frontend** | Chart.js is pinned and loaded with a Subresource Integrity hash |
| **Dependencies** | `npm audit` reports no known vulnerabilities |
| **Secrets** | `.env` files are ignored by Git |

---

## Privacy

The app stores teacher names, email addresses, password hashes, the marks data teachers upload, the analytics calculated from it, saved insights, and a record of report downloads.

- Uploaded files themselves are not stored.
- A teacher can only see their own data. Deleting an upload removes everything linked to it.
- If Groq is configured, summary figures, questions and PDF text are sent to Groq to produce answers.

Full wording: [Privacy Policy](frontend/privacy.html) and [Terms of Use](frontend/terms.html), both linked from the footer of the app.

---

## Future enhancements

- [ ] Let teachers choose how multi-subject pass or fail is decided (every subject, or the average)
- [ ] Email verification and a password reset flow
- [ ] Refresh tokens and sign out everywhere
- [ ] A shared rate limit store so the app can run on more than one server
- [ ] Frontend tests, and more API tests against a test database
- [ ] Better PDF reading for scanned or complex layouts
- [ ] Compare several uploads of the same class over time
- [ ] A Docker setup for easier installs

---

## Author

**Varshith Vardhan Chiluveru**, GitHub: [varshithvardhan2006-09](https://github.com/varshithvardhan2006-09)

---

## License

Released under the [MIT License](LICENSE). © 2026 Varshith Vardhan Chiluveru.
