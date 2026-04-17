// ======================== FIREBASE CONFIG ========================
// Replace these with your actual Firebase project credentials
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyANhcuLHxsG78_oPdEugq8-mAcOmNaDx3M",
  authDomain: "secret-number-survival.firebaseapp.com",
  databaseURL: "https://secret-number-survival-default-rtdb.firebaseio.com/",
  projectId: "secret-number-survival",
  storageBucket: "secret-number-survival.firebasestorage.app",
  messagingSenderId: "182578495283",
  appId: "1:182578495283:web:3ddcc133848e2c4067c846",
  measurementId: "G-9MSVP97XF5"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
