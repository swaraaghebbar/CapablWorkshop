# VytalCare Health Navigator

A unified personal health monitoring dashboard that aggregates wellness metrics, manages medication schedules, and uses Google Gemini for AI-driven analysis. Integrated with Google Fit, Firebase, and n8n for automated workflows.

---

<div align="center">

## Technology Stack

<a href="https://react.dev/"><img src="https://raw.githubusercontent.com/github/explore/master/topics/react/react.png" height="40"/></a> <a href="https://vitejs.dev/"><img src="https://raw.githubusercontent.com/vitejs/vite/main/docs/public/logo.svg" height="40"/></a> <a href="https://tailwindcss.com/"><img src="https://raw.githubusercontent.com/github/explore/master/topics/tailwind/tailwind.png" height="40"/></a> <a href="https://firebase.google.com/"><img src="https://www.gstatic.com/devrel-devsite/prod/vd7f7m3vtkqddjwbnmh9z0n6r3df23mfgp2ykcq4kxy63as73v0/svg/firebase/firebase.svg" height="40"/></a> <a href="https://developers.google.com/fit"><img src="https://ssl.gstatic.com/images/branding/product/2x/google_fit_96dp.png" height="40"/></a> <a href="https://ai.google.dev/"><img src="https://avatars.githubusercontent.com/u/136474420?s=200&v=4" height="40"/></a> <a href="https://recharts.org/"><img src="https://recharts.org/assets/logo.png" height="40"/></a> <a href="https://n8n.io/"><img src="https://raw.githubusercontent.com/n8n-io/n8n/master/assets/n8n-logo.png" height="40"/></a>

---

### Badges

<img src="https://img.shields.io/badge/Framework-React-61DAFB?logo=react&logoColor=white"/>  
<img src="https://img.shields.io/badge/Build-Vite-646CFF?logo=vite&logoColor=white"/>  
<img src="https://img.shields.io/badge/Styling-TailwindCSS-06B6D4?logo=tailwindcss&logoColor=white"/>  
<img src="https://img.shields.io/badge/Database-Firestore-FFCA28?logo=firebase&logoColor=black"/>  
<img src="https://img.shields.io/badge/APIs-Google%20Fit-4285F4?logo=googlefit&logoColor=white"/>  
<img src="https://img.shields.io/badge/AI-Gemini-4285F4?logo=google&logoColor=white"/>  
<img src="https://img.shields.io/badge/Automation-n8n-EA4AAA?logo=n8n&logoColor=white"/>  

</div>

---

# Overview

VytalCare is a comprehensive personal health dashboard designed to centralize real-time health data, medications, hydration, and AI-generated insights.
The system combines Google Fit health metrics with Firebase-powered data persistence and Gemini-based conversational wellness guidance.

---

# Key Features

## 1. Activity Dashboard & Health Metrics

* Google Fit REST API integration (steps, sleep, calories, distance, heart rate).
* Recharts-based visualizations:

  * Steps (3-hour buckets)
  * Heart rate trends
  * Weekly distance
  * Sleep duration patterns
* Hydration tracker with daily goal resets.
* Health Score (0–100) calculated using a weighted engine.

---

## 2. Medication Management

* Full CRUD for prescriptions.
* Real-time browser notifications for reminders.
* "Mark as Taken" logs into `medication_logs`.
* n8n webhook triggered on prescription creation.

---

## 3. AI-Powered Insights

* Gemini 2.5 Flash generates wellness analysis in a structured, tabular format.
* In-app health chatbot with persisted message history.

---

## 4. User Profile & Persistence

* Auth via Google OAuth 2.0 or Firebase Anonymous/Auth tokens.
* All data synced across devices using Firestore.

---

# Technologies & Libraries

<table>
<tr>
<td><strong>React</strong></td>
<td>UI framework using hooks and component architecture.</td>
</tr>
<tr>
<td><strong>Vite</strong></td>
<td>Fast bundler and dev server.</td>
</tr>
<tr>
<td><strong>Tailwind CSS</strong></td>
<td>Utility-first responsive styling.</td>
</tr>
<tr>
<td><strong>Lucide React</strong></td>
<td>Icon set for UI elements.</td>
</tr>
<tr>
<td><strong>Recharts</strong></td>
<td>Charts for activity visualization.</td>
</tr>
<tr>
<td><strong>Firebase SDK</strong></td>
<td>Auth, Firestore, and storage handling.</td>
</tr>
<tr>
<td><strong>Google Fitness API</strong></td>
<td>Aggregated activity and health metric data.</td>
</tr>
<tr>
<td><strong>Gemini API</strong></td>
<td>AI insights, chat, and analysis.</td>
</tr>
<tr>
<td><strong>n8n</strong></td>
<td>Workflow automation for medication triggers.</td>
</tr>
</table>

---

# System Architecture

## Authentication Flow

1. Google OAuth 2.0 login
2. Required scopes:

   * activity.read
   * sleep.read
   * heart_rate.read
   * location.read
3. Access token stored in client state for Fitness API calls.

## Data Workflow

* **Pull:** Google Fit → Aggregated Metric Buckets → App Dashboard
* **Push:** Profile, Chat, Medication & Hydration → Firestore

## AI Interaction

* Metrics converted into structured prompts.
* Gemini's response parsed → Rendered as HTML.

---

# Setup & Installation

## Prerequisites

* Node.js v16+
* Google Cloud Console project with:

  * Fitness API enabled
  * Generative Language API enabled
* Firebase Project created

---

## Steps

### Clone repository

```bash
git clone https://github.com/your-username/vytalcare.git
cd vytalcare
```

### Install dependencies

```bash
npm install
```

### Start development server

```bash
npm run dev
```

---

# Configuration

Create a `.env` file:

```env
FIREBASE_CONFIG='{
  "apiKey": "",
  "authDomain": "",
  "projectId": "",
  "storageBucket": "",
  "messagingSenderId": "",
  "appId": ""
}'

GOOGLE_CLIENT_ID=""
GEMINI_API_KEY=""
```

The codebase includes `FIREBASE_LOCAL_CONFIG` for local development fallback.

---

# Database Schema

Data is stored under:

```
/artifacts/{appId}/users/{userId}/
```

<table>
<tr>
<th>Collection / Doc</th>
<th>Fields</th>
<th>Description</th>
</tr>

<tr>
<td><strong>profile (Doc)</strong></td>
<td>userName, userAge, caregiverName, etc.</td>
<td>User demographic info</td>
</tr>

<tr>
<td><strong>medications (Coll)</strong></td>
<td>name, dose, times[], createdAt</td>
<td>Active prescriptions</td>
</tr>

<tr>
<td><strong>medication_logs (Coll)</strong></td>
<td>medicationId, status, takenAt, dateKey</td>
<td>Adherence logs</td>
</tr>

<tr>
<td><strong>hydration (Coll)</strong></td>
<td>amount, goal, updatedAt</td>
<td>Daily water intake per date</td>
</tr>

<tr>
<td><strong>chats (Coll)</strong></td>
<td>role, text, sources, createdAt</td>
<td>Chatbot conversation history</td>
</tr>
</table>

---

# External Services

### Google Fitness API

* Aggregate Endpoint
  `https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate`
* Sessions Endpoint
  `https://www.googleapis.com/fitness/v1/users/me/sessions`

### Gemini AI

`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`

### n8n Webhook

`https://AdityaPrakash781-vytalcare-n8n.hf.space/webhook/new-medication`


