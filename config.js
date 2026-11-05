// Configuration for Google/Firebase Auth, Google Analytics 4, and AWS Lambda Endpoints

export const CONFIG = {
  // Dedicated Firebase Auth Config for Promises to Creation (promisestocreation)
  FIREBASE_CONFIG: {
    apiKey: "AIzaSyCVfBZ4ksEg-qpbOkf4G4TMyZ7JgKji4xQ",
    authDomain: "promisestocreation.firebaseapp.com",
    projectId: "promisestocreation",
    storageBucket: "promisestocreation.firebasestorage.app",
    messagingSenderId: "567729724898",
    appId: "1:567729724898:web:e61bb96edd7f6e6a38edbb"
  },

  // Google Analytics 4 Measurement ID (Property: bible, properties/562336985)
  GA_MEASUREMENT_ID: 'G-6B52RELLEB',

  // Live AWS Lambda Function URLs (CloudFormation stack: `bible`, Region: `us-east-1`)
  API_ENDPOINTS: {
    profile: 'https://aytrpwi3aczvy2tkmrau22ayzi0zoska.lambda-url.us-east-1.on.aws/',
    progress: 'https://oxbj2xwmojjdfgl447hgqhiyv40qlpxy.lambda-url.us-east-1.on.aws/'
  }
};
