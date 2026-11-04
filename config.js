// Configuration for Google OAuth, Google Analytics 4, and AWS Lambda Endpoints

export const CONFIG = {
  // Google OAuth 2.0 Web Client ID (Nuri HQ)
  GOOGLE_CLIENT_ID: '719377736713-fobtcss0udkkl5u930aifhe5318rlaf9.apps.googleusercontent.com',

  // Google Analytics 4 Measurement ID
  GA_MEASUREMENT_ID: 'G-M5WYQQQWVV',

  // Live AWS Lambda Function URLs (CloudFormation stack: `bible`, Region: `us-east-1`)
  API_ENDPOINTS: {
    profile: 'https://aytrpwi3aczvy2tkmrau22ayzi0zoska.lambda-url.us-east-1.on.aws/',
    progress: 'https://oxbj2xwmojjdfgl447hgqhiyv40qlpxy.lambda-url.us-east-1.on.aws/'
  }
};
