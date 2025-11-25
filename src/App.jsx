import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
// >> IMPORTED: orderBy, limit <<
import { getFirestore, collection, query, onSnapshot, addDoc, doc, deleteDoc, orderBy, limit } from 'firebase/firestore';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend
} from 'recharts';

import { Plus, X, Trash2, Calendar, Clock, MessageSquare, Bell, Send, Link, Activity, Heart, Moon, CheckCircle, AlertCircle, ChevronRight } from 'lucide-react';

/** ---------------------------------------
 * App Config (unchanged)
 * -------------------------------------- */
const isLocalRun = typeof __initial_auth_token === 'undefined';

const FIREBASE_LOCAL_CONFIG = {
  apiKey: "AIzaSyAdR5AX4GyipuN1OJZew9wxjzsUawMLovU",
  authDomain: "health-navigator-cb1e9.firebaseapp.com",
  projectId: "health-navigator-cb1e9",
  storageBucket: "health-navigator-cb1e9.firebasestorage.app",
  messagingSenderId: "320930192297",
  appId: "1:320930192297:web:b3ad8eaeabdf18330782b8",
  measurementId: "G-N2FRL54GFF"
};

// Gemini & Google Fit keys (local)
const GEMINI_API_KEY = 'MY API KEY'
const GOOGLE_CLIENT_ID = 'MY GOOGLE CLIENT ID';

const appId = (typeof __app_id !== 'undefined' ? __app_id : 'local-health-app').replace(/[\/.]/g, '-');
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
const firebaseConfig = isLocalRun
  ? FIREBASE_LOCAL_CONFIG
  : (typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {});

// Health constants
const DAILY_STEP_GOAL = 10000;
const RECOMMENDED_SLEEP_HOURS = 7.5;

// COLOR SCHEME - Removed in favor of Tailwind classes
// const COLORS = { ... };

/** ---------------------------------------
 * Small UI Helpers (unchanged)
 * -------------------------------------- */
const LoadingSpinner = () => (
  <div className="flex justify-center items-center py-4">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
    <span className="ml-3 text-primary font-medium">Loading...</span>
  </div>
);

const StepCompletionRing = ({ steps, goal, size = 150 }) => {
  const rawPercentage = (steps / goal) * 100;
  const percentage = Math.min(100, Math.round(rawPercentage));
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;
  const isComplete = percentage >= 100;

  return (
    <div className="relative flex flex-col items-center justify-center p-4">
      <svg width={size} height={size} viewBox="0 0 120 120" className="-rotate-90">
        <circle cx="60" cy="60" r={radius} fill="none" className="stroke-slate-200" strokeWidth="10" />
        <circle cx="60" cy="60" r={radius} fill="none"
          className={`transition-all duration-1000 ease-out ${isComplete ? 'stroke-green-500' : 'stroke-primary'}`}
          strokeWidth="10"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <p className={`text-4xl font-extrabold ${isComplete ? 'text-green-600' : 'text-primary'}`}>{percentage}%</p>
        <p className="text-sm font-semibold mt-1 text-text-muted">Completed</p>
      </div>
    </div>
  );
};

const formatTime = (timeStr) => {
  if (!timeStr || timeStr.length !== 4) return timeStr;
  const hours = parseInt(timeStr.substring(0, 2), 10);
  const minutes = timeStr.substring(2, 4);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes} ${ampm}`;
};

/** ---------------------------------------
 * Auth Login Card (unchanged)
 * -------------------------------------- */
const LoginPage = ({ handleLogin, error }) => (
  <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-background">
    <div className="max-w-md w-full p-8 rounded-3xl shadow-xl bg-surface text-center border border-slate-100 animate-fade-in">
      <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
        <Heart className="w-8 h-8 text-primary" />
      </div>
      <h1 className="text-4xl font-bold mb-3 text-text-main tracking-tight">Health Navigator</h1>
      <p className="text-lg mb-8 text-text-muted">
        Your personal AI health companion. Sign in to manage medications and track your vitals.
      </p>

      {error && !error.type && (
        <div className="p-4 rounded-xl mb-6 bg-red-50 text-red-600 border border-red-100 text-sm font-medium">
          {typeof error === 'string' ? error : JSON.stringify(error)}
        </div>
      )}

      <button
        onClick={handleLogin}
        className="w-full py-4 text-white text-lg font-bold rounded-xl transition-all duration-200 shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5 bg-primary flex items-center justify-center group"
      >
        <img
          src="https://www.gstatic.com/images/icons/material/system/2x/google_white_24dp.png"
          alt="Google icon"
          className="w-5 h-5 mr-3 group-hover:scale-110 transition-transform"
        />
        Sign In with Google
      </button>

      <p className="mt-6 text-xs text-text-muted">
        By connecting, you authorize access to your Google Fit activity, sleep, and heart-rate data.
      </p>
    </div>
  </div>
);

/** ---------------------------------------
 * Networking helper (unchanged)
 * -------------------------------------- */
const exponentialBackoffFetch = async (url, options, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        if (response.status === 429 && i < maxRetries - 1) {
          const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
    }
  }
  throw new Error("Failed to fetch after multiple retries.");
};

/** ---------------------------------------
 * Main App
 * -------------------------------------- */
const App = () => {
  // Firebase & core state
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [medications, setMedications] = useState([]);
  const [newMedication, setNewMedication] = useState({ name: '', dose: '', times: ['08:00'] });
  const [isAdding, setIsAdding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('reminders');

  // Chatbot
  // >> INITIAL CHAT HISTORY IS NOW A WELCOME MESSAGE ONLY <<
  const initialChatWelcome = { role: 'model', text: 'Hello! I am your Health Navigator chatbot. I can provide general information on medications, conditions, and health topics using Google Search for the latest context. Always consult a professional for medical advice!', sources: [], createdAt: Date.now() };
  const [chatHistory, setChatHistory] = useState([initialChatWelcome]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Google Fit auth token (unchanged)
  const [googleAccessToken, setGoogleAccessToken] = useState(null);

  // Health metrics (unchanged)
  const [stepCount, setStepCount] = useState(null);
  const [sleepHours, setSleepHours] = useState(null);
  const [calories, setCalories] = useState(null);
  const [distance, setDistance] = useState(null); // km
  const [heartRate, setHeartRate] = useState(null); // FIX 1 & 2: Complete heartRate state declaration
  const [heartRateTrend, setHeartRateTrend] = useState([]);
  const [stepsTrend, setStepsTrend] = useState([]);
  const [distanceTrend, setDistanceTrend] = useState([]);
  const [sleepTrend, setSleepTrend] = useState([]);


  // Loading flags (unchanged)
  const [isStepsLoading, setIsStepsLoading] = useState(false);
  const [isSleepLoading, setIsSleepLoading] = useState(false);
  const [isCaloriesLoading, setIsCaloriesLoading] = useState(false);
  const [isDistanceLoading, setIsDistanceLoading] = useState(false);
  const [isHeartRateLoading, setIsHeartRateLoading] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [isAutoSyncActive, setIsAutoSyncActive] = useState(false);

  // Assessment (unchanged)
  const [assessmentResult, setAssessmentResult] = useState(null);
  const [isAssessmentLoading, setIsAssessmentLoading] = useState(false);

  /** ----------------------------
   * Firebase init & auth (unchanged)
   * --------------------------- */
  useEffect(() => {
    // ... (Firebase init logic) ...
    try {
      const isConfigMissing = !firebaseConfig.apiKey;
      if (isConfigMissing) {
        if (isLocalRun) {
          setError("DATABASE/AUTH ERROR: Please update FIREBASE_LOCAL_CONFIG in App.jsx for local persistence.");
        } else {
          setError("Failed to initialize the app due to missing config.");
        }
        setDb(null);
        setAuth(null);
        setUserId(crypto.randomUUID());
        setIsLoading(false);
        return;
      }

      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const authentication = getAuth(app);

      setDb(firestore);
      setAuth(authentication);

      const unsubscribeAuth = onAuthStateChanged(authentication, async (user) => {
        if (user) {
          setUserId(user.uid);
          setIsLoading(false);
        } else {
          if (initialAuthToken) {
            await signInWithCustomToken(authentication, initialAuthToken);
          } else {
            const anonUser = await signInAnonymously(authentication);
            setUserId(anonUser.user.uid);
          }
          setIsLoading(false);
        }
      });

      return () => unsubscribeAuth();
    } catch (e) {
      console.error("Firebase Initialization Error:", e);
      setError("Failed to initialize the app. Check console for details.");
      setIsLoading(false);
    }
  }, [isLocalRun]);

  /** ----------------------------
   * Firestore Listeners
   * --------------------------- */

  // 1. Medication Listener
  useEffect(() => {
    if (!db || !userId) return;
    const q = query(collection(db, `/artifacts/${appId}/users/${userId}/medications`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const meds = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMedications(meds);
    }, (error) => {
      console.error("Error fetching medications:", error);
      if (auth?.currentUser) setError("Failed to fetch medications.");
    });
    return () => unsubscribe();
  }, [db, userId, auth]);

  // 2. Chat History Listener
  useEffect(() => {
    if (!db || !userId) return;
    const chatCollectionRef = collection(db, `/artifacts/${appId}/users/${userId}/chats`);
    const qChat = query(chatCollectionRef, orderBy('createdAt', 'asc'), limit(100));

    const unsubscribe = onSnapshot(qChat, (snapshot) => {
      const chatMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (chatMessages.length > 0) {
        setChatHistory(chatMessages);
      } else {
        setChatHistory([initialChatWelcome]);
      }
    }, (error) => {
      console.error("Failed to fetch chat history:", error);
      if (auth?.currentUser) setError("Failed to fetch chat history.");
    });

    return () => unsubscribe();
  }, [db, userId, auth, initialChatWelcome]);

  // Browser Notification Permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
  }, []);

  // Check for reminders every minute
  useEffect(() => {
    const checkReminders = () => {
      if (Notification.permission !== 'granted') return;

      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      medications.forEach(med => {
        if (med.times && Array.isArray(med.times)) {
          med.times.forEach(time => {
            const [h, m] = time.split(':').map(Number);
            if (h === currentHour && currentMinute === m) {
              new Notification(`Time to take ${med.name}`, {
                body: `It's ${time}. Dose: ${med.dose}`,
                icon: '/vite.svg'
              });
            }
          });
        }
      });
    };

    const now = new Date();
    const msUntilNextMinute = (60 - now.getSeconds()) * 1000;

    let interval;
    const timeout = setTimeout(() => {
      checkReminders();
      interval = setInterval(checkReminders, 60000);
    }, msUntilNextMinute);

    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, [medications]);

  /** ----------------------------
   * OAuth Login (unchanged)
   * --------------------------- */
  const handleLogin = () => {
    // ... (unchanged) ...
    const redirectUri = window.location.origin;
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${GOOGLE_CLIENT_ID}&` +
      `redirect_uri=${redirectUri}&` +
      `response_type=token&` +
      // NOTE: add heart_rate scope
      `scope=${encodeURIComponent([
        'https://www.googleapis.com/auth/fitness.activity.read',
        'https://www.googleapis.com/auth/fitness.sleep.read',
        'https://www.googleapis.com/auth/fitness.heart_rate.read',
        'https://www.googleapis.com/auth/fitness.location.read'
      ].join(' '))}&` +
      `state=google-fit-connect`;
    window.location.href = authUrl;
  };

  // Parse access token from URL (unchanged)
  useEffect(() => {
    if (window.location.hash) {
      const hash = window.location.hash.substring(1);
      const params = hash.split('&').reduce((acc, part) => {
        const [key, value] = part.split('=');
        if (key && value) acc[decodeURIComponent(key)] = decodeURIComponent(value);
        return acc;
      }, {});
      const accessToken = params['access_token'];
      const state = params['state'];
      if (accessToken && state === 'google-fit-connect') {
        setGoogleAccessToken(accessToken);
        setError({ type: 'success', message: 'Signed in with Google and connected to Fit successfully! Welcome.' });
        window.history.replaceState({}, document.title, window.location.pathname);
        setActiveTab('activity');
      }
    }
  }, []);

  /** ---------------------------------------
   * Helpers: consistent time window (unchanged)
   * -------------------------------------- */
  const getTodayWindow = () => {
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const tzOffset = new Date().getTimezoneOffset() * 60 * 1000; // ms
    const localMidnight = now - ((now - tzOffset) % oneDayMs); // local day start
    const LATENCY_BUFFER_MS = 2 * 60 * 1000;
    return {
      startTimeMillis: localMidnight,
      endTimeMillis: now - LATENCY_BUFFER_MS
    };
  };

  /** ---------------------------------------
   * Google Fit Fetchers (unchanged)
   * -------------------------------------- */
  // ... (fetchSteps, fetchSleep, fetchCalories, fetchDistance, fetchHeartRate, syncAll unchanged) ...

  const fetchSteps = useCallback(async () => {
    if (!googleAccessToken) { setError('Error: Google Fit Access Token is missing. Please sign in again.'); return 0; }
    setIsStepsLoading(true);
    const { startTimeMillis, endTimeMillis } = getTodayWindow();
    const body = {
      aggregateBy: [{
        dataTypeName: "com.google.step_count.delta",
        dataSourceId: "derived:com.google.step_count.delta:com.google.android.gms:estimated_steps"
      }],
      bucketByTime: { durationMillis: endTimeMillis - startTimeMillis },
      startTimeMillis, endTimeMillis
    };
    try {
      const res = await exponentialBackoffFetch('https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${googleAccessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      const steps = data.bucket?.[0]?.dataset?.[0]?.point?.[0]?.value?.[0]?.intVal;
      if (typeof steps === 'number') {
        setStepCount(steps);
        setStepsTrend([{ name: 'Today', steps: steps, goal: DAILY_STEP_GOAL }]);
        return steps;
      } else {
        setStepCount(0);
        setError('No step data found for today.');
        return 0;
      }
    } catch (e) {
      console.error(e);
      setStepCount(0);
      setError('Failed to fetch steps.');
      return 0;
    } finally {
      setIsStepsLoading(false);
    }
  }, [googleAccessToken]);

  const fetchSleep = useCallback(async () => {
    if (!googleAccessToken) { setError('Error: Google Fit Access Token is missing. Please sign in again.'); return 0; }
    setIsSleepLoading(true);
    const now = Date.now();
    const startTimeIso = new Date(now - 36 * 60 * 60 * 1000).toISOString();
    const endTimeIso = new Date(now).toISOString();
    const sessionsUrl = `https://www.googleapis.com/fitness/v1/users/me/sessions?startTime=${startTimeIso}&endTime=${endTimeIso}&activityType=72`;
    try {
      const res = await exponentialBackoffFetch(sessionsUrl, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${googleAccessToken}`, 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      const sleepSessions = data.session || [];
      if (!sleepSessions.length) {
        setSleepHours(0);
        setError('No sleep data found for the past 36 hours.');
        return 0;
      }
      const oneDayMs = 24 * 60 * 60 * 1000;
      const totalSleepMs = sleepSessions.reduce((total, s) => {
        if (s.endTimeMillis > (now - oneDayMs)) {
          return total + (s.endTimeMillis - s.startTimeMillis);
        }
        return total;
      }, 0);
      const hours = Math.round((totalSleepMs / (1000 * 60 * 60)) * 10) / 10;
      setSleepHours(hours);
      setSleepTrend(prev => [...prev.slice(-6), { name: `Rec ${prev.length + 1}`, hours }]);
      return hours;
    } catch (e) {
      console.error(e);
      setSleepHours(0);
      setError('Failed to fetch sleep data.');
      return 0;
    } finally {
      setIsSleepLoading(false);
    }
  }, [googleAccessToken]);

  // Calories (merged source) — matches Google Fit app totals
  const fetchCalories = useCallback(async () => {
    if (!googleAccessToken) { setError('Error: Google Fit Access Token is missing. Please sign in again.'); return 0; }
    setIsCaloriesLoading(true);
    const { startTimeMillis, endTimeMillis } = getTodayWindow();
    const body = {
      aggregateBy: [{
        dataTypeName: "com.google.calories.expended",
        dataSourceId: "derived:com.google.calories.expended:com.google.android.gms:merge_calories_expended"
      }],
      bucketByTime: { durationMillis: endTimeMillis - startTimeMillis },
      startTimeMillis, endTimeMillis
    };
    try {
      const res = await exponentialBackoffFetch('https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${googleAccessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      const kcal = data.bucket?.[0]?.dataset?.[0]?.point?.[0]?.value?.[0]?.fpVal;
      if (typeof kcal === 'number') {
        setCalories(Math.round(kcal));
        return kcal;
      } else {
        setCalories(0);
        setError('No calories data found for today.');
        return 0;
      }
    } catch (e) {
      console.error(e);
      setCalories(0);
      setError('Failed to fetch calories.');
      return 0;
    } finally {
      setIsCaloriesLoading(false);
    }
  }, [googleAccessToken]);

  // Distance (merged source) — fixes “0 km” mismatch
  const fetchDistance = useCallback(async () => {
    if (!googleAccessToken) { setError('Error: Google Fit Access Token is missing. Please sign in again.'); return 0; }
    setIsDistanceLoading(true);
    const { startTimeMillis, endTimeMillis } = getTodayWindow();
    const body = {
      aggregateBy: [{
        dataTypeName: "com.google.distance.delta",
        dataSourceId: "derived:com.google.distance.delta:com.google.android.gms:merge_distance_delta"
      }],
      bucketByTime: { durationMillis: endTimeMillis - startTimeMillis },
      startTimeMillis, endTimeMillis
    };
    try {
      const res = await exponentialBackoffFetch('https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${googleAccessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();

      // Robust parsing: Sum up all points in all buckets
      let totalMeters = 0;
      if (data.bucket && Array.isArray(data.bucket)) {
        data.bucket.forEach(bucket => {
          if (bucket.dataset && Array.isArray(bucket.dataset)) {
            bucket.dataset.forEach(ds => {
              if (ds.point && Array.isArray(ds.point)) {
                ds.point.forEach(p => {
                  if (p.value && Array.isArray(p.value)) {
                    const val = p.value[0]?.fpVal;
                    if (typeof val === 'number') {
                      totalMeters += val;
                    }
                  }
                });
              }
            });
          }
        });
      }

      if (totalMeters > 0) {
        const km = totalMeters / 1000;
        setDistance(km.toFixed(2));
        setDistanceTrend(prev => [...prev.slice(-11), { name: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), km: parseFloat((km).toFixed(2)) }]);
        return km;
      } else {
        setDistance(0);
        // Don't show error if just 0 distance, it might be valid
        return 0;
      }
    } catch (e) {
      console.error(e);
      setDistance(0);
      if (e.message.includes('403')) {
        setError('Permission denied for distance. Please sign out and sign in again to grant location access.');
      } else {
        setError('Failed to fetch distance.');
        }
      return 0;
    } finally {
      setIsDistanceLoading(false);
    }
  }, [googleAccessToken]);

  // Heart rate — return latest sample seen in last 24h or show “no data” message
  const fetchHeartRate = useCallback(async () => {
    if (!googleAccessToken) { setError('Error: Google Fit Access Token is missing. Please sign in again.'); return null; }
    setIsHeartRateLoading(true);
    const now = Date.now();
    const startTimeMillis = now - 24 * 60 * 60 * 1000;
    const endTimeMillis = now - 60 * 1000; // 1-minute buffer

    const body = {
      aggregateBy: [{
        dataTypeName: "com.google.heart_rate.bpm",
        dataSourceId: "derived:com.google.heart_rate.bpm:com.google.android.gms:merge_heart_rate_bpm"
      }],
      bucketByTime: { durationMillis: 60 * 60 * 1000 }, // hourly buckets
      startTimeMillis, endTimeMillis
    };

    try {
      const res = await exponentialBackoffFetch('https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${googleAccessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();

      let latestBpm = null; // FIX 3: Declare latestBpm in the outer scope.

      // prepare trend data (hourly buckets)
      if (Array.isArray(data.bucket)) {
        const hrData = data.bucket.map(b => {
          const pts = b?.dataset?.[0]?.point;
          const bpmVal = (Array.isArray(pts) && pts.length) ? (pts[pts.length - 1]?.value?.[0]?.fpVal ?? null) : null;
          return {
            time: new Date(parseInt(b.startTimeMillis)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            bpm: typeof bpmVal === 'number' ? Math.round(bpmVal) : null
          };
        }).filter(d => d.bpm !== null);
        if (hrData.length) setHeartRateTrend(hrData);

        // find the most recent bucket that has at least one point
        for (let i = data.bucket.length - 1; i >= 0; i--) {
          const pts = data.bucket[i]?.dataset?.[0]?.point;
          if (Array.isArray(pts) && pts.length) {
            const lastPoint = pts[pts.length - 1];
            const v = lastPoint?.value?.[0]?.fpVal;
            if (typeof v === 'number') { latestBpm = Math.round(v); break; }
          }
        }
      }
      // FIX 4, 5, 6, 7: Removed unnecessary else block, duplicated loop, and hanging brace.

      if (latestBpm !== null) {
        setHeartRate(latestBpm);
        return latestBpm;
      } else {
        setHeartRate(null);
        setError('No heart-rate data found in the last 24 hours (wearable not connected).');
        return null;
      }
    } catch (e) {
      console.error(e);
      setHeartRate(null);
      setError('Failed to fetch heart-rate.');
      return null;
    } finally {
      setIsHeartRateLoading(false);
    }
  }, [googleAccessToken]);

  // One-click sync (does all fetches, shows explicit messages)
  const syncAll = useCallback(async () => {
    setIsSyncingAll(true);
    setAssessmentResult(null);
    try {
      const results = await Promise.allSettled([
        fetchSteps(),
        fetchSleep(),
        fetchCalories(),
        fetchDistance(),
        fetchHeartRate()
      ]);

      // If every promise failed or returned empty values, show a generic banner
      const someData =
        (stepCount ?? 0) > 0 ||
        (sleepHours ?? 0) > 0 ||
        (calories ?? 0) > 0 ||
        (parseFloat(distance) ?? 0) > 0 ||
        (heartRate ?? null) !== null;

      if (!someData) {
        setError('Synced, but no metrics were available for today. Open Google Fit and sync your device, then try again.');
      } else {
        setError({ type: 'success', message: 'Synced today’s data successfully.' });
      }

      return results;
    } finally {
      setIsSyncingAll(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleAccessToken, stepCount, sleepHours, calories, distance, heartRate, fetchSteps, fetchSleep, fetchCalories, fetchDistance, fetchHeartRate]); // Added fetch* dependencies to suppress linter warning

  // Auto-sync: call once on login, and enable repeating sync when user presses Sync button
  useEffect(() => {
    if (!googleAccessToken) return;
    // call once on login
    syncAll();
  }, [googleAccessToken, syncAll]); // FIX 8: Added syncAll to dependency array

  useEffect(() => {
    if (!googleAccessToken) return;
    let interval = null;
    if (isAutoSyncActive) {
      // start immediate and then every 20s
      syncAll();
      interval = setInterval(() => { syncAll(); }, 20000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isAutoSyncActive, googleAccessToken, syncAll]); // FIX 9: Added syncAll to dependency array


  /** ---------------------------------------
   * Assessment (unchanged)
   * -------------------------------------- */
  const callAssessmentAPI = useCallback(async () => {
    const apiKey = isLocalRun ? GEMINI_API_KEY : "";
    if (!apiKey) {
      setError("GEMINI API ERROR: Missing API Key in local run.");
      return;
    }
    setIsAssessmentLoading(true);

    const prompt = `
Analyze all available health metrics and provide a combined wellness analysis.

Metrics:
- Steps Today: ${stepCount ?? "N/A"}
- Sleep Hours: ${sleepHours ?? "N/A"}
- Calories Burned: ${calories ?? "N/A"}
- Distance Travelled: ${distance ?? "N/A"} km
- Heart Rate: ${heartRate ?? "N/A"} bpm

Go through the previous data which the user has mentioned to provide contextual responsed and maintain the context
Give a professional health assessment considering activity level, recovery, cardiovascular load, and overall daily balance.
Provide 3 realistic, actionable recommendations.
`;

    const systemPrompt = `You are a direct, objective, and professional Wellness Analyst. Provide an honest, integrated assessment of the user's steps, sleep, calories, distance, and heart-rate data. Compare against reasonable goals (10k steps, ~7.5h sleep).`;

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ "google_search": {} }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
    };

    try {
      const res = await exponentialBackoffFetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      const candidate = result.candidates?.[0];
      let modelText = "Sorry, I couldn't generate a response. Please check the console for API errors.";
      let sources = [];

      if (candidate && candidate.content?.parts?.[0]?.text) {
        modelText = candidate.content.parts[0].text;
        const groundingMetadata = candidate.groundingMetadata;
        if (groundingMetadata?.groundingAttributions) {
          sources = groundingMetadata.groundingAttributions
            .map(a => ({ uri: a.web?.uri, title: a.web?.title }))
            .filter(s => s.uri && s.title);
        }
      } else if (result.error) {
        modelText = `API Error: ${result.error.message}.`;
      }
      setAssessmentResult({ text: modelText, sources });
    } catch (e) {
      console.error(e);
      setAssessmentResult({ text: `Error fetching assessment: Network error or API issue.`, sources: [] });
    } finally {
      setIsAssessmentLoading(false);
    }
  }, [isLocalRun, stepCount, sleepHours, calories, distance, heartRate]);

  /** ---------------------------------------
   * Chatbot API Call - MODIFIED TO SAVE TO FIREBASE
   * -------------------------------------- */
  const callChatbotAPI = useCallback(async (newMessage) => {
    const apiKey = isLocalRun ? GEMINI_API_KEY : "";
    if (!apiKey) {
      setError("GEMINI API ERROR: Missing API Key in local run. Cannot chat.");
      return;
    }
    setIsChatLoading(true);

    // Prepare history for API call (limit and convert format)
    const contents = [...chatHistory, { role: 'user', text: newMessage }]
      .slice(-10) // Keep the last 10 messages for context
      .map(msg => ({
        role: msg.role === 'model' ? 'model' : 'user', // Ensure role consistency
        parts: [{ text: msg.text }]
      }));

    const systemInstruction = {
      parts: [{
        text: 'You are a helpful and professional Health Navigator chatbot. Provide general, non-diagnostic information on medications, conditions, and health topics. Always state that your advice is not a substitute for professional medical consultation. Use Google Search for up-to-date context.'
      }]
    };

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

    const payload = {
      contents: contents,
      tools: [{ "google_search": {} }],
      systemInstruction: systemInstruction,
    };

    // 1. Prepare and Save User Message to Firestore
    const userMessage = {
      role: 'user',
      text: newMessage,
      sources: [],
      createdAt: Date.now()
    };

    if (db && userId) {
      try {
        const chatCollectionRef = collection(db, `/artifacts/${appId}/users/${userId}/chats`);
        // Don't await, let it save in the background
        addDoc(chatCollectionRef, userMessage);
      } catch (e) {
        console.error("Error saving user message to Firestore:", e);
      }
    }

    // Optimistic UI update: add user message immediately
    setChatHistory(prev => [...prev, userMessage]);


    try {
      const res = await exponentialBackoffFetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      const candidate = result.candidates?.[0];
      let modelText = "Sorry, I couldn't generate a response. Please check the console for API errors.";

      if (candidate && candidate.content?.parts?.[0]?.text) {
        modelText = candidate.content.parts[0].text;
      } else if (result.error) {
        modelText = `API Error: ${result.error.message}.`;
      }

      const modelMessage = {
        role: 'model',
        text: modelText,
        sources: [],
        createdAt: Date.now()
      };

      // 2. Save Model Response Message to Firestore
      if (db && userId) {
        try {
          const chatCollectionRef = collection(db, `/artifacts/${appId}/users/${userId}/chats`);
          // Await this to ensure the message is in the DB before the loading spinner disappears
          await addDoc(chatCollectionRef, modelMessage);
        } catch (e) {
          console.error("Error saving model message to Firestore:", e);
        }
      }

      // The onSnapshot listener (in useEffect) will now handle updating the chatHistory state, 
      // ensuring the UI reflects the persisted data accurately, including the IDs.

    } catch (e) {
      console.error("Chatbot API Error:", e);
      setChatHistory(prev => [...prev, { role: 'model', text: `Error fetching response: Network error or API issue.`, sources: [] }]);
    } finally {
      setIsChatLoading(false);
    }
  }, [isLocalRun, chatHistory, db, userId]); // Dependency update: added db and userId

  /** ---------------------------------------
   * Meds CRUD (unchanged)
   * -------------------------------------- */
  const handleNewMedChange = (e) => {
    const { name, value } = e.target;
    setNewMedication(prev => ({ ...prev, [name]: value }));
  };
  const handleTimeChange = (index, value) => {
    const cleanValue = value.replace(':', '').slice(0, 4);
    setNewMedication(prev => {
      const newTimes = [...prev.times];
      newTimes[index] = value;
      return { ...prev, times: newTimes };
    });
  };
  const handleAddTime = () => setNewMedication(prev => ({ ...prev, times: [...prev.times, '08:00'] }));
  const handleRemoveTime = (indexToRemove) => setNewMedication(prev => ({ ...prev, times: prev.times.filter((_, i) => i !== indexToRemove) }));

  const handleSaveMedication = async () => {
    const isConfigMissing = !firebaseConfig.apiKey;
    if (!db || !userId) {
      if (isLocalRun && isConfigMissing) {
        setError("Database Error: Provide Firebase config in FIREBASE_LOCAL_CONFIG to enable persistence.");
      } else {
        setError("Database not ready. Please wait for initialization or check Firebase setup.");
      }
      return;
    }
    if (!newMedication.name.trim() || !newMedication.dose.trim() || newMedication.times.every(t => !t.trim())) {
      setError('Please enter a name, dose, and at least one time.');
      return;
    }
    const validTimes = newMedication.times
      .map(t => t.trim())
      .filter(t => t.match(/^\d{2}:\d{2}$/))
      .map(t => t.replace(':', ''))
      .sort();
    if (validTimes.length === 0) { setError('Use the time picker to select valid times.'); return; }

    const medicationData = {
      name: newMedication.name.trim(),
      dose: newMedication.dose.trim(),
      times: validTimes,
      createdAt: Date.now()
    };

    try {
      const medCollectionRef = collection(db, `/artifacts/${appId}/users/${userId}/medications`);
      await addDoc(medCollectionRef, medicationData);
      setNewMedication({ name: '', dose: '', times: ['08:00'] });
      setIsAdding(false);
      setError(null);
    } catch (e) {
      console.error("Error adding document: ", e);
      setError(`Failed to save medication: ${e.message}.`);
    }
  };

  const handleDeleteMedication = async (id) => {
    if (!db) return;
    const medDocRef = doc(db, `/artifacts/${appId}/users/${userId}/medications`, id);
    try { await deleteDoc(medDocRef); }
    catch (e) { console.error("Error deleting document: ", e); setError("Failed to delete medication."); }
  };

  const todaySchedule = medications
    .flatMap(med => med.times.map(time => ({
      time: time,
      medName: med.name,
      dose: med.dose,
      medId: med.id,
      key: med.id + time,
    })))
    .sort((a, b) => a.time.localeCompare(b.time));

  /** ---------------------------------------
   * Renderers (unchanged)
   * -------------------------------------- */
  const renderMedicationForm = () => (
    <div className="p-6 rounded-2xl space-y-5 bg-surface border border-slate-100 shadow-sm animate-fade-in">
      <h3 className="text-lg font-bold text-text-main">Add New Medication</h3>

      <div className="space-y-3">
        <input
          type="text" name="name" value={newMedication.name} onChange={handleNewMedChange}
          placeholder="Medication Name (e.g., Vitamin D)"
          className="w-full p-3 border border-slate-200 rounded-xl placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-slate-50 focus:bg-white"
        />
        <input
          type="text" name="dose" value={newMedication.dose} onChange={handleNewMedChange}
          placeholder="Dose (e.g., 1000 IU or 1 tab)"
          className="w-full p-3 border border-slate-200 rounded-xl placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-slate-50 focus:bg-white"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2 text-text-muted">Daily Schedule Times</label>
        <div className="flex flex-wrap gap-3 items-center">
          {newMedication.times.map((time, index) => (
            <div key={`time-input-${index}`} className="flex items-center space-x-2 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
              <input
                type="time" value={time} onChange={(e) => handleTimeChange(index, e.target.value)}
                className="w-24 p-1.5 bg-white border border-slate-200 rounded-md text-center text-sm focus:outline-none focus:border-primary"
              />
              <button
                onClick={() => handleRemoveTime(index)}
                className="p-1.5 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                aria-label="Remove time"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <button
            onClick={handleAddTime}
            className="flex items-center px-3 py-2 rounded-lg border border-dashed border-primary/40 text-primary text-sm font-medium hover:bg-primary/5 transition-colors"
          >
            <Plus size={14} className="mr-1.5" /> Add Time
          </button>
        </div>
      </div>

      <div className="pt-2 flex justify-end">
        <button
          onClick={handleSaveMedication}
          className="flex items-center px-6 py-3 bg-primary text-white font-semibold rounded-xl shadow-md shadow-primary/20 hover:bg-primary-dark hover:-translate-y-0.5 transition-all duration-200"
        >
          <Bell size={18} className="mr-2" /> Save Medication
        </button>
      </div>
    </div>
  );

  const renderRemindersTab = () => {
    // Find next dose
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    let nextDose = null;
    let minDiff = Infinity;

    todaySchedule.forEach(item => {
      const [h, m] = item.time.split(':').map(Number);
      const itemMinutes = h * 60 + m;
      let diff = itemMinutes - currentMinutes;

      // If it's earlier today, it's passed. We only want future doses for "Next Dose"
      // Unless we want to show tomorrow's first dose? For now, let's stick to today's remaining.
      if (diff > 0 && diff < minDiff) {
        minDiff = diff;
        nextDose = { ...item, diffMinutes: diff };
      }
    });

    return (
      <div className="space-y-8 p-6 animate-fade-in">
        <div className="flex justify-between items-center pb-4 border-b border-slate-100">
          <h2 className="text-2xl font-bold text-text-main flex items-center">
            <Bell size={28} className="mr-3 text-primary" />
            Medication Reminders
          </h2>
          <button
            onClick={() => setIsAdding(!isAdding)}
            className={`flex items-center px-4 py-2 rounded-xl font-medium transition-all duration-200 ${isAdding ? 'bg-slate-100 text-text-muted hover:bg-slate-200' : 'bg-primary text-white shadow-md shadow-primary/20 hover:bg-primary-dark'}`}
          >
            {isAdding ? <X size={18} className="mr-2" /> : <Plus size={18} className="mr-2" />}
            {isAdding ? 'Close Form' : 'Add Medication'}
          </button>
        </div>

        {isAdding && renderMedicationForm()}

        {/* Next Dose Card */}
        {nextDose && (
          <div className="bg-gradient-to-r from-primary to-teal-600 rounded-3xl p-6 text-white shadow-lg shadow-primary/20 animate-slide-up">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-primary-100 font-medium mb-1">Up Next</p>
                <h3 className="text-3xl font-bold">{nextDose.medName}</h3>
                <p className="text-white/80 mt-1 flex items-center">
                  <span className="bg-white/20 px-2 py-0.5 rounded-lg text-sm mr-2">{nextDose.dose}</span>
                  at {formatTime(nextDose.time)}
                </p>
              </div>
              <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-sm">
                <Clock size={32} className="text-white" />
              </div>
            </div>
            <div className="mt-6 pt-4 border-t border-white/10 flex justify-between items-center">
              <p className="text-sm font-medium">
                Due in {Math.floor(nextDose.diffMinutes / 60)}h {nextDose.diffMinutes % 60}m
              </p>
              <button className="px-4 py-2 bg-white text-primary font-bold rounded-xl text-sm hover:bg-slate-50 transition-colors">
                Mark as Taken
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Timeline Column */}
          <div className="lg:col-span-2 space-y-6">
            <h3 className="text-lg font-bold flex items-center text-text-main">
              <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center mr-3 text-primary">
                <Calendar size={18} />
              </div>
              Today's Timeline
            </h3>

            {isLoading ? (
              <LoadingSpinner />
            ) : todaySchedule.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <Bell size={48} className="mx-auto mb-3 text-slate-300" />
                <p className="text-text-muted italic">No medications scheduled for today.</p>
              </div>
            ) : (
              <div className="relative pl-8 space-y-8 before:content-[''] before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-200">
                {todaySchedule.sort((a, b) => a.time.localeCompare(b.time)).map((item, idx) => {
                  const [h, m] = item.time.split(':').map(Number);
                  const itemMinutes = h * 60 + m;
                  const isPast = itemMinutes < currentMinutes;

                  return (
                    <div key={item.key} className="relative group">
                      {/* Timeline Dot */}
                      <div className={`absolute -left-[39px] top-1/2 -translate-y-1/2 w-6 h-6 rounded-full border-4 border-white shadow-sm z-10 ${isPast ? 'bg-slate-300' : 'bg-primary'}`} />

                      <div className={`flex items-center justify-between p-5 rounded-2xl border transition-all duration-200 ${isPast ? 'bg-slate-50 border-slate-100 opacity-70' : 'bg-white border-slate-100 shadow-sm hover:shadow-md hover:border-primary/30'}`}>
                        <div className="flex items-center gap-5">
                          <div className={`text-xl font-mono font-bold ${isPast ? 'text-slate-400' : 'text-primary'}`}>
                            {formatTime(item.time)}
                          </div>
                          <div>
                            <p className={`text-lg font-bold ${isPast ? 'text-slate-500' : 'text-text-main'}`}>{item.medName}</p>
                            <p className="text-sm text-text-muted flex items-center">
                              <span className={`w-1.5 h-1.5 rounded-full mr-2 ${isPast ? 'bg-slate-300' : 'bg-secondary'}`}></span>
                              {item.dose}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {isPast && <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-2">Passed</span>}
                          <button
                            onClick={() => handleDeleteMedication(item.medId)}
                            className="p-2 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                            aria-label="Delete medication"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* All Medications Sidebar */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-text-main">All Prescriptions</h3>
            {medications.length === 0 ? (
              <p className="text-text-muted italic text-sm">You have no saved medications.</p>
            ) : (
              <div className="space-y-3">
                {medications.map(med => (
                  <div key={med.id} className="p-4 bg-white rounded-xl shadow-sm border border-slate-100 hover:border-primary/30 transition-colors group">
                    <div className="flex justify-between items-start mb-2">
                      <p className="font-bold text-text-main">{med.name}</p>
                      <button
                        onClick={() => handleDeleteMedication(med.id)}
                        className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <p className="text-xs text-text-muted mb-2">{med.dose}</p>
                    <div className="flex flex-wrap gap-1">
                      {med.times.map(t => (
                        <span key={t} className="text-[10px] bg-slate-50 text-text-muted px-1.5 py-0.5 rounded border border-slate-100 font-mono">
                          {formatTime(t)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderActivityTab = () => (
    <div className="p-6 space-y-8 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-100 pb-4">
        <h2 className="text-2xl font-bold text-text-main flex items-center">
          <Activity size={28} className="mr-3 text-primary" />
          Activity Dashboard
        </h2>
        <div className="mt-4 md:mt-0 flex space-x-3">
          <button
            onClick={!isSyncingAll ? (() => { setIsAutoSyncActive(true); syncAll(); }) : undefined}
            className={`px-5 py-2.5 bg-primary text-white font-semibold rounded-xl shadow-md shadow-primary/20 transition-all duration-200 flex items-center ${isSyncingAll ? "opacity-70 cursor-wait" : "hover:bg-primary-dark hover:-translate-y-0.5"}`}
          >
            <Activity size={18} className={`mr-2 ${isSyncingAll ? 'animate-spin' : ''}`} />
            {isSyncingAll ? "Syncing..." : "Sync Data"}
          </button>
          <button
            onClick={!isAssessmentLoading ? callAssessmentAPI : undefined}
            className={`px-5 py-2.5 bg-secondary text-white font-semibold rounded-xl shadow-md shadow-secondary/20 transition-all duration-200 flex items-center ${isAssessmentLoading ? "opacity-70 cursor-wait" : "hover:bg-secondary-dark hover:-translate-y-0.5"}`}
            disabled={
              isAssessmentLoading ||
              (stepCount ?? null) === null &&
              (sleepHours ?? null) === null &&
              (calories ?? null) === null &&
              (distance ?? null) === null &&
              (heartRate ?? null) === null
            }
          >
            <MessageSquare size={18} className="mr-2" />
            {isAssessmentLoading ? 'Analyzing...' : 'AI Insight'}
          </button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Steps Card */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow flex flex-col items-center justify-center relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110" />
          {stepCount !== null ? (
            <>
              <StepCompletionRing steps={stepCount} goal={DAILY_STEP_GOAL} size={160} />
              <div className="mt-2 text-center z-10">
                <p className="text-3xl font-bold text-text-main">{stepCount.toLocaleString()}</p>
                <p className="text-sm text-text-muted font-medium">Steps Today</p>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-text-muted">
              <Activity size={48} className="mx-auto mb-3 text-slate-300" />
              <p>No step data</p>
            </div>
          )}
        </div>

        {/* Sleep Card */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow flex flex-col items-center justify-center relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110" />
          {sleepHours !== null ? (
            <>
              <div className={`w-32 h-32 rounded-full flex items-center justify-center border-4 mb-4 ${sleepHours < RECOMMENDED_SLEEP_HOURS ? 'border-secondary/30 bg-secondary/5' : 'border-green-100 bg-green-50'}`}>
                <Moon size={32} className={sleepHours < RECOMMENDED_SLEEP_HOURS ? 'text-secondary' : 'text-green-600'} />
              </div>
              <div className="text-center z-10">
                <p className="text-4xl font-bold text-text-main">{sleepHours}<span className="text-xl text-text-muted ml-1">h</span></p>
                <p className="text-sm text-text-muted font-medium">Sleep Duration</p>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-text-muted">
              <Moon size={48} className="mx-auto mb-3 text-slate-300" />
              <p>No sleep data</p>
            </div>
          )}
        </div>

        {/* Calories Card */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow flex flex-col items-center justify-center relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-orange-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110" />
          {calories !== null ? (
            <>
              <div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center mb-4 text-orange-600">
                <Activity size={32} />
              </div>
              <div className="text-center z-10">
                <p className="text-4xl font-bold text-text-main">{calories}</p>
                <p className="text-sm text-text-muted font-medium">Calories Burned</p>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-text-muted">
              <p>No calorie data</p>
            </div>
          )}
        </div>

        {/* Distance Card */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow flex flex-col items-center justify-center relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110" />
          {distance !== null ? (
            <>
              <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mb-4 text-blue-600">
                <Activity size={32} />
              </div>
              <div className="text-center z-10">
                <p className="text-4xl font-bold text-text-main">{distance}<span className="text-xl text-text-muted ml-1">km</span></p>
                <p className="text-sm text-text-muted font-medium">Distance</p>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-text-muted">
              <p>No distance data</p>
            </div>
          )}
        </div>

        {/* Heart Rate Card */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow flex flex-col items-center justify-center relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-red-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110" />
          {heartRate !== null ? (
            <>
              <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mb-4 text-red-600 animate-pulse">
                <Heart size={32} fill="currentColor" />
              </div>
              <div className="text-center z-10">
                <p className="text-4xl font-bold text-text-main">{heartRate}<span className="text-xl text-text-muted ml-1">bpm</span></p>
                <p className="text-sm text-text-muted font-medium">Heart Rate</p>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-text-muted">
              <Heart size={48} className="mx-auto mb-3 text-slate-300" />
              <p>No heart rate data</p>
            </div>
          )}
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold text-text-main mb-6 flex items-center">
            <Heart size={20} className="mr-2 text-secondary" /> Heart Rate Trend
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={heartRateTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="time" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                itemStyle={{ color: '#0F766E' }}
              />
              <Line type="monotone" dataKey="bpm" stroke="#FB7185" strokeWidth={3} dot={{ r: 4, fill: '#FB7185', strokeWidth: 0 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold text-text-main mb-6 flex items-center">
            <Activity size={20} className="mr-2 text-primary" /> Steps vs Goal
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={stepsTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: '#f8fafc' }}
                contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Legend />
              <Bar dataKey="steps" fill="#0F766E" radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="goal" stroke="#10B981" strokeWidth={2} dot={false} strokeDasharray="5 5" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold text-text-main mb-6">Distance Trend</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={distanceTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Line type="monotone" dataKey="km" stroke="#0F766E" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold text-text-main mb-6">Sleep Trend</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={sleepTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: '#f8fafc' }}
                contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Bar dataKey="hours" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* AI Assessment Report */}
      {
        (isAssessmentLoading || assessmentResult) && (
          <div className="mt-8 bg-white p-8 rounded-3xl shadow-lg border border-slate-100 animate-slide-up">
            <h3 className="text-2xl font-bold flex items-center mb-6 text-text-main">
              <div className="w-10 h-10 bg-secondary/10 rounded-xl flex items-center justify-center mr-3">
                <MessageSquare size={20} className="text-secondary" />
              </div>
              Wellness Analysis
            </h3>

            {isAssessmentLoading && (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-12 h-12 border-4 border-slate-200 border-t-secondary rounded-full animate-spin mb-4" />
                <p className="text-text-muted animate-pulse">Generating insights...</p>
              </div>
            )}

            {assessmentResult && !isAssessmentLoading && (
              <div className="space-y-6">
                <div className="prose prose-slate max-w-none"
                  dangerouslySetInnerHTML={{
                    __html: assessmentResult.text
                      .replace(/^### (.*$)/gim, '<h3 class="text-xl font-bold text-primary mt-6 mb-3">$1</h3>')
                      .replace(/^## (.*$)/gim, '<h2 class="text-2xl font-bold text-text-main mt-8 mb-4">$1</h2>')
                      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-text-main">$1</strong>')
                      .replace(/^\s*[-•]\s+(.*)$/gim, '<li class="ml-4 mb-2 text-text-muted list-disc">$1</li>')
                      .replace(/\n/g, '<br/>')
                  }}
                />

                {assessmentResult.sources && assessmentResult.sources.length > 0 && (
                  <div className="mt-6 pt-6 border-t border-slate-100">
                    <p className="font-semibold text-sm text-text-muted mb-3 uppercase tracking-wider">Sources</p>
                    <div className="flex flex-wrap gap-2">
                      {assessmentResult.sources.map((source, idx) => (
                        <a key={idx} href={source.uri} target="_blank" rel="noopener noreferrer"
                          className="flex items-center px-3 py-1.5 bg-slate-50 rounded-lg text-xs text-primary hover:bg-primary/5 hover:underline transition-colors border border-slate-100">
                          <Link size={12} className="mr-1.5" />
                          <span className="max-w-[200px] truncate">{source.title}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      }
    </div >
  );

  const renderChatbotTab = () => (
    <div className="flex flex-col h-[70vh] p-6 animate-fade-in">
      <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4">
        <h2 className="text-2xl font-bold text-text-main flex items-center">
          <MessageSquare size={28} className="mr-3 text-primary" />
          Health Chatbot
        </h2>
        <div className="text-xs text-text-muted bg-slate-50 px-3 py-1 rounded-full border border-slate-100">
          Powered by Gemini
        </div>
      </div>

      <div className="flex-grow overflow-y-auto space-y-6 pr-2 mb-4 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
        {chatHistory.map((msg, index) => (
          <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-1 ${msg.role === 'user' ? 'bg-primary ml-3' : 'bg-secondary/10 mr-3'}`}>
                {msg.role === 'user' ? <Activity size={16} className="text-white" /> : <MessageSquare size={16} className="text-secondary" />}
              </div>
              <div
                className={`p-4 rounded-2xl shadow-sm text-sm leading-relaxed ${msg.role === 'user'
                  ? 'bg-primary text-white rounded-tr-none'
                  : 'bg-slate-50 text-text-main border border-slate-100 rounded-tl-none'
                  }`}
              >
                <p className="whitespace-pre-wrap">{msg.text}</p>
              </div>
            </div>
          </div>
        ))}
        {isChatLoading && (
          <div className="flex justify-start">
            <div className="flex max-w-[85%] flex-row">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary/10 flex items-center justify-center mt-1 mr-3">
                <MessageSquare size={16} className="text-secondary" />
              </div>
              <div className="p-4 rounded-2xl rounded-tl-none bg-slate-50 border border-slate-100 shadow-sm">
                <div className="flex space-x-2">
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={(e) => {
        e.preventDefault();
        const message = chatInput.trim();
        if (!message) return;
        const currentMessage = message;
        setChatInput('');
        callChatbotAPI(currentMessage);
      }} className="relative mt-2">
        <input
          type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)}
          placeholder="Ask a health question..."
          className="w-full p-4 pr-32 border border-slate-200 rounded-2xl placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-slate-50 focus:bg-white shadow-sm"
        />
        <button
          type="submit"
          disabled={!chatInput.trim() || isChatLoading}
          className={`absolute right-2 top-2 bottom-2 px-6 rounded-xl font-semibold transition-all duration-200 flex items-center ${chatInput.trim() && !isChatLoading
            ? 'bg-primary text-white shadow-md hover:bg-primary-dark hover:shadow-lg'
            : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
        >
          <Send size={18} className="mr-2" /> Send
        </button>
      </form>
    </div>
  );

  /** ---------------------------------------
   * Error banner (unchanged)
   * -------------------------------------- */
  const renderError = () => {
    if (!error) return null;
    const isSuccess = typeof error === 'object' && error.type === 'success';
    const messageText = isSuccess ? error.message : (typeof error === 'string' ? error : JSON.stringify(error));

    return (
      <div className={`p-4 rounded-xl mb-6 flex items-center justify-between border ${isSuccess ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
        <span className="font-medium">{isSuccess ? 'Success: ' : 'Error: '}{messageText}</span>
        <button onClick={() => setError(null)} className="hover:opacity-70 transition-opacity"><X size={20} /></button>
      </div>
    );
  };

  /** ---------------------------------------
   * Render (unchanged)
   * -------------------------------------- */
  if (!googleAccessToken) return <LoginPage handleLogin={handleLogin} error={error} />;

  return (
    <div className="min-h-screen p-4 sm:p-8 bg-background text-text-main font-sans">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 pb-6 border-b border-slate-200">
          <div className="flex items-center mb-4 md:mb-0">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center mr-3">
              <Heart className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-text-main tracking-tight">Health Navigator</h1>
          </div>

          <div className="flex bg-white p-1.5 rounded-2xl shadow-sm border border-slate-100">
            {[
              { id: 'reminders', icon: Bell, label: 'Reminders' },
              { id: 'activity', icon: Activity, label: 'Activity' },
              { id: 'chatbot', icon: MessageSquare, label: 'Chatbot' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center px-5 py-2.5 rounded-xl font-medium transition-all duration-200 ${activeTab === tab.id
                  ? 'bg-primary text-white shadow-md shadow-primary/20'
                  : 'text-text-muted hover:bg-slate-50 hover:text-text-main'
                  }`}
              >
                <tab.icon size={18} className="mr-2" />
                {tab.label}
              </button>
            ))}
                  </div>
                  <button
                      className="mt-2 px-5 py-2.5 bg-red-500 text-white font-semibold rounded-xl shadow-md shadow-red-300 
        hover:bg-red-400 transition-all duration-200 flex items-center gap-2
        "
                    onClick={() => {
          if (window.confirm("⚠️ Are you sure you want to call an ambulance?")) {
            alert("🚑 Ambulance is being contacted...");
          }
        }}
            >
              🚑 AMBULANCE
            </button>
        </div>

        {renderError()}

        <div className="bg-surface rounded-3xl shadow-xl shadow-slate-200/50 min-h-[60vh] border border-slate-100 overflow-hidden">
          {activeTab === 'reminders' && renderRemindersTab()}
          {activeTab === 'activity' && renderActivityTab()}
          {activeTab === 'chatbot' && renderChatbotTab()}
        </div>
      </div>
    </div>
  );
};

export default App;
