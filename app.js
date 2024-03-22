import express from "express";
import dotenv from 'dotenv';
import SpotifyWebApi from "spotify-web-api-node";
import session from "express-session";
import OpenAI from "openai";
import readline from 'readline';
import bodyParser from "body-parser";
import cors from 'cors'


dotenv.config();



const spotifyApi = new SpotifyWebApi({
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  redirectUri: process.env.REDIRECT_URI
});

const app = express();
const PORT = 3000;

app.use(cors(), express.json());

app.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`))

const staticHandler = express.static("public");
app.use(staticHandler);

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,          
    saveUninitialized: true,  
    cookie: { secure: false }  // Set to 'true' in production when using HTTPS 
}));
console.log("SESSION_SECRET:", process.env.SESSION_SECRET);

app.get('/', (req, res) => {
    res.send('Hello from Bahjas and Adrianas Project! :)')
})



//*SPOTIFY

const scopes = [
  'ugc-image-upload',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'streaming',
  'app-remote-control',
  'user-read-email',
  'user-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-read-private',
  'playlist-modify-private',
  'user-library-modify',
  'user-library-read',
  'user-top-read',
  'user-read-playback-position',
  'user-read-recently-played',
  'user-follow-read',
  'user-follow-modify'
];

app.get('/login', (req, res) => {
  res.redirect(spotifyApi.createAuthorizeURL(scopes));
});

app.get('/callback', (req, res) => {
  const error = req.query.error;
  const code = req.query.code;
  const state = req.query.state;

  if (error) {
    console.error('Callback Error:', error);
    res.send(`Callback Error: ${error}`);
    return;
  }
  console.log("Authorization Code:", code);
  spotifyApi
    .authorizationCodeGrant(code)
    .then(data => {
      const access_token = data.body['access_token'];
      const refresh_token = data.body['refresh_token'];
      const expires_in = data.body['expires_in'];
      
      

      spotifyApi.setAccessToken(access_token);
      spotifyApi.setRefreshToken(refresh_token);

      // console.log('access_token:', access_token);
      // console.log('refresh_token:', refresh_token);

      req.session.accessToken = data.body['access_token']; 
      
       // ***** NEW CODE START *****
       const getUserAndStoreId = async () => {   
        const userData = await spotifyApi.getMe(); 
        // console.log("userData in getUserAndStoreId:", userData)
        req.session.userId = userData.body.id; 
        req.session.market = userData.body.country; // Store the country code
        console.log(req.session.market)
      };

      getUserAndStoreId(); // Call the async function 
      // ***** NEW CODE END *****


      // console.log('callback userID', req.session.userId)
      // console.log('callback session', req.session)
      // console.log('callback access token', req.session.accessToken)
      // console.log('Session after setting token:', req.session);

      

      console.log(
        `Sucessfully retreived access token. Expires in ${expires_in} s.`
      );
      res.send('Success! You can now close the window.');

      setInterval(async () => {
        const data = await spotifyApi.refreshAccessToken();
        const access_token = data.body['access_token'];

        console.log('The access token has been refreshed!');
        console.log('access_token:', access_token);
        spotifyApi.setAccessToken(access_token);
      }, expires_in / 2 * 1000);
    })
    .catch(error => {
      console.error('Error getting Tokens:', error);
      console.error("Error Details:", error.body);
      res.send(`Error getting Tokens: ${error}`);
    });
});

app.get('/test-spotify', async (req, res) => {
  // console.log("Session:", req.session)
  const accessToken = req.session.accessToken;
  // console.log("access token", req.session.accessToken)
  if (!accessToken) {
      return res.status(401).send('No access token found in session'); 
  }

  spotifyApi.setAccessToken(accessToken);

  try {
      // Example: Fetch the user's profile
      const userData = await spotifyApi.getMe();
      res.send(`Your Spotify profile: ${JSON.stringify(userData)}`);

  } catch (err) {
      console.error('Error fetching Spotify data:', err);
      res.status(500).send('An error occurred while talking to Spotify');
  }
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// //*helper function to get song list
async function fetchSongTitlesFromOpenAI(mood) {
  const completion = await openai.chat.completions.create({
    messages: [{ role: "system", content: `Generate a playlist of songs with a ${mood} vibe. Include only song titles, one per line.` }],
    model: "gpt-3.5-turbo",
  });

  const songTitles = completion.choices[0].message.content.split('\n');
  return songTitles; // Return the array of song titles
}

async function searchForSongOnSpotify(songTitle, market) {
  const searchParams = new URLSearchParams({
    q: songTitle,
    type: 'track',
    market: market 
  });

  const searchResponse = await spotifyApi.searchTracks(searchParams.toString());

  if (searchResponse.body.tracks.items.length > 0) {
    // return searchResponse.body.tracks.items[0].id;  
    const trackId = searchResponse.body.tracks.items[0].id; 
    return `spotify:track:${trackId}`; // Ensure the correct URI format
  } else {
    console.log(`Track not found on Spotify: ${songTitle}`); 
    return null; 
  } 
}
app.post('/create-playlist', async (req, res) => {
  const accessToken = req.session.accessToken;
  if (!accessToken) {
      return res.status(401).send('No access token found in session'); 
  }
  const userId = req.session.id;
  spotifyApi.setAccessToken(accessToken); 

  const mood = req.body.mood; 
  const playlistName = req.body.playlistName + ' (Generated by OpenAI)';
  const songTitles = await fetchSongTitlesFromOpenAI(mood);

  const foundTrackIds = []; 

  for (const songTitle of songTitles) {
      const trackId = await searchForSongOnSpotify(songTitle, req.session.market);  
      if (trackId) {
          foundTrackIds.push(trackId);
      }
  }

  const playlistCreationResponse = await spotifyApi.createPlaylist(userId, {
    name: playlistName,
    public: true 
  });

  const playlistId = playlistCreationResponse.body.id; 
  console.log("Playlist created with ID:", playlistId);

  if (foundTrackIds.length > 0) {
    console.log("Track IDs:", foundTrackIds); 
    await spotifyApi.addTracksToPlaylist(playlistId, foundTrackIds);
    console.log('Tracks added to playlist!');
  }

  console.log("Songs from OpenAI:", songTitles);
  console.log("'/create-playlist' endpoint hit!");  
  res.send('Create Playlist Endpoint - Under Construction');
});

// async function testOpenAI() {
//   const readlineInterface = readline.createInterface({
//     input: process.stdin,
//     output: process.stdout
//   });

//   readlineInterface.question('Enter a mood: ', async (mood) => {
//     const songTitles = await fetchSongTitlesFromOpenAI(mood);
//     console.log(songTitles);  
//     readlineInterface.close();
//   });
// }

// testOpenAI(); // Call the test function