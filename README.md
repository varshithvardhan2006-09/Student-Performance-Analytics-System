# Student Analysis Hub

Student Analysis Hub is a semester-wise teacher portal for college faculty to manage, import, and analyze student performance data.

The project now uses MongoDB only. CSV storage has been removed. Teachers can work semester by semester, enter subject-wise marks, calculate total percentage automatically, and review rankings, statistics, charts, and subject breakdowns from the dashboard.

## What The Project Does

- Secure teacher login for the portal
- Semester-wise student result management for `Semester 1` to `Semester 8`
- Subject-wise marks entry for each semester
- Automatic total percentage calculation from subject marks
- Rankings page based on total percentage
- Subject-wise marks page for detailed student records
- Statistics page for class-level averages and subject averages
- Visual dashboard with charts for performance and attendance
- File import support for Excel, PDF, and Word documents
- MongoDB-backed storage for student records

## Current Data Model

Each student result is stored as one record per:

- `Student ID`
- `Semester`

Each record contains:

- `ID`
- `Name`
- `Semester`
- `Attendance`
- `Subjects`
- `TotalPercentage`

This means the same student can have separate records for different semesters.

## Semester Subject Structure

The app is configured with semester-specific subject templates.

### Semester 1

- Engineering Mathematics - I
- Engineering Physics
- English
- Programming for Problem Solving using C
- Indian Constitution
- Physics Lab
- English Laboratory
- Programming for Problem Solving using C Lab
- Basic Workshop Practice

### Semester 2

- Engineering Mathematics - II
- Engineering Chemistry
- Problem Solving using Python Programming
- Basic Electronics & Sensors
- Effective Technical Communication in English
- Chemistry Lab
- Problem Solving using Python Programming Lab
- Basic Electronics & Sensors Lab
- Engineering Drawing Practice
- Computational Mathematics Lab

### Semester 3

- Logic and Switching Theory
- Database Management Systems
- Discrete Mathematics
- Data Structures and Algorithms Using C
- Object Oriented Programming using JAVA
- Environmental Science
- Database Management Systems Lab
- Data Structures and Algorithms Using C Lab
- Object Oriented Programming Using JAVA Lab

### Semester 4

- Computer Organization and Microprocessor
- Web Programming
- Finance & Accounting
- Software Engineering
- Engineering Mathematics-III (Probability & Statistics)
- Computer Organization and Microprocessor Lab
- Web Programming Lab
- Software Engineering Lab
- Theme Based Project

### Semester 5

- Design and Analysis of Algorithms
- Operating Systems
- Automata Languages and Computation
- Computer Networks
- Professional Elective - I
- Design and Analysis of Algorithms Lab
- Full Stack Development Lab
- Operating Systems Lab
- Computer Networks Lab
- Mini Project

### Semester 6

- Embedded Systems and IoT
- Compiler Construction
- Artificial Intelligence and Machine Learning
- Professional Elective - II
- Professional Elective - III
- Open Elective - I
- Embedded Systems and IoT Lab
- Artificial Intelligence and Machine Learning Lab
- DevOps Lab
- Summer Internship

### Semester 7

- Neural Networks & Deep Learning
- Distributed Systems & Cloud Computing
- Professional Elective - IV
- Open Elective - II
- Essence of Indian Traditional Knowledge
- Neural Networks & Deep Learning Lab
- Mobile Application Development Lab
- Distributed Systems & Cloud Computing Lab
- Project Work - I
- Summer Internship

### Semester 8

- Professional Elective - V
- Open Elective - III
- Project Work - II

## Main Pages In The Dashboard

- `Visual Dashboard`
  Shows charts for total percentage, attendance, and grade distribution for the selected semester.

- `Rankings`
  Shows students ordered by total percentage.

- `Subject Wise Marks`
  Shows all subject marks for each student. Students are ordered by roll number and displayed in pages so the screen stays readable.

- `Statistics`
  Shows class-level averages, attendance insights, and subject averages.

- `Add or Import`
  Lets teachers add one student result manually or import files for a selected semester.

## Backend

Backend location:

- [backend/index.js](C:\CSIT\TBP\backend\index.js)

Main backend responsibilities:

- Connect to MongoDB
- Serve frontend files
- Authenticate login
- Provide semester data and semester subject templates
- Accept new semester-wise student records
- Import student records from uploaded files
- Validate subject names by semester
- Calculate total percentage from subject marks

Important API routes:

- `POST /api/login`
- `GET /api/semesters`
- `GET /api/students?semester=Semester 1`
- `GET /api/stats?semester=Semester 1`
- `POST /api/students`
- `POST /api/import-students`

## Frontend

Frontend files:

- [frontend/index.html](C:\CSIT\TBP\frontend\index.html)
- [frontend/module.html](C:\CSIT\TBP\frontend\module.html)
- [frontend/script.js](C:\CSIT\TBP\frontend\script.js)
- [frontend/style.css](C:\CSIT\TBP\frontend\style.css)

Main frontend behavior:

- Global semester selector in the header
- Separate module page for each dashboard function
- Subject-wise form inputs that change based on semester
- Auto-calculated total percentage while entering marks
- Subject-wise student records shown without horizontal scrolling
- Student ordering by roll number in subject-wise view

## How To Run

### 1. Install dependencies

Backend dependencies are installed from:

- [backend/package.json](C:\CSIT\TBP\backend\package.json)

Run:

```powershell
cd C:\CSIT\TBP\backend
npm install
```

### 2. Start MongoDB

Make sure your MongoDB server is running locally, or set your own connection string in `.env`.

Default connection:

```text
mongodb://127.0.0.1:27017
```

### 3. Start the server

```powershell
cd C:\CSIT\TBP\backend
node index.js
```

Expected startup output is similar to:

```text
Server: http://localhost:3000
MongoDB: mongodb://127.0.0.1:27017/tbp.students
```

### 4. Open the app

Open:

```text
http://localhost:3000/index.html
```

Default demo login:

- Username: `admin`
- Password: `tbp123`

## Notes For Anyone Downloading The Project

- This project is semester-aware, so always choose the correct semester before entering or importing marks.
- Total percentage is calculated from the stored subject marks when subject data exists.
- If old student records were saved using earlier subject templates, they may need to be re-entered or re-imported to match the latest semester structure.
- The backend is MongoDB-only now. `data.csv` and CSV parsing are no longer part of the active storage flow.

## Recent Major Changes

- Removed CSV-based storage completely
- Migrated student storage to MongoDB
- Added semester-wise records from Semester 1 to Semester 8
- Added semester-specific subject templates
- Added subject-wise marks entry and analysis
- Updated rankings to use calculated total percentage
- Added separate `Subject Wise Marks` dashboard module
- Improved module navigation and semester filtering
- Reworked the subject-wise page to show all subjects for a student while paging students
