// Configuration for Google/Firebase Auth, Google Analytics 4, and AWS Lambda Endpoints

export const CONFIG = {
  // Google OAuth 2.0 Web Client ID (from existing authorized Firebase project hiragana-1394f)
  GOOGLE_CLIENT_ID: '711379868720-vklubpkqbdevj8a528jteeu8nfbhvgq6.apps.googleusercontent.com',

  // Existing Firebase Auth Config (with nurihq.github.io authorized via Identity Toolkit API)
  FIREBASE_CONFIG: {
    apiKey: 'AIzaSyBKgUerYYOQrUQVWymFrbhYsBW18cHaIuI',
    authDomain: 'hiragana-1394f.firebaseapp.com',
    projectId: 'hiragana-1394f',
    storageBucket: 'hiragana-1394f.firebasestorage.app',
    messagingSenderId: '711379868720',
    appId: '1:711379868720:web:18dc90ff849bb0843961f5'
  },

  // Google Analytics 4 Measurement ID (Property: bible, properties/562336985)
  GA_MEASUREMENT_ID: 'G-6B52RELLEB',

  // Live AWS Lambda Function URLs (CloudFormation stack: `bible`, Region: `us-east-1`)
  API_ENDPOINTS: {
    profile: 'https://aytrpwi3aczvy2tkmrau22ayzi0zoska.lambda-url.us-east-1.on.aws/',
    progress: 'https://oxbj2xwmojjdfgl447hgqhiyv40qlpxy.lambda-url.us-east-1.on.aws/'
  }
};
