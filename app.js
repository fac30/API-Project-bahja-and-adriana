import express from "express";
import dotenv from 'dotenv';
import SpotifyWebApi from "spotify-web-api-node";
import session from "express-session";

dotenv.config();

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  redirectUri: process.env.REDIRECT_URI
});

const app = express();
const PORT = 3000;

app.use(express.json());

app.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`))

const staticHandler = express.static("public");
app.use(staticHandler);

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,          
    saveUninitialized: true,  
    cookie: { secure: false }  // Set to 'true' in production when using HTTPS 
}));

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
  
    spotifyApi
      .authorizationCodeGrant(code)
      .then(data => {
        const access_token = data.body['access_token'];
        const refresh_token = data.body['refresh_token'];
        const expires_in = data.body['expires_in'];
  
        spotifyApi.setAccessToken(access_token);
        spotifyApi.setRefreshToken(refresh_token);
  
        console.log('access_token:', access_token);
        console.log('refresh_token:', refresh_token);

        req.session.accessToken = data.body['access_token']; 
        console.log(req.session)
  
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
        res.send(`Error getting Tokens: ${error}`);
      });
  });

 

app.get('/search', async (req, res) => {
    const searchQuery = req.query.q; 
    console.log("user searched for:", searchQuery); 

    const accessToken = req.session.accessToken;
    if (!accessToken) {
        return res.status(401).send('No access token found in session'); 
    }

    spotifyApi.setAccessToken(accessToken); 

    try {
        const searchResults = await spotifyApi.searchArtists(searchQuery);
        console.log("Spotify API Search Results:", searchResults);
    } catch (err) {
        console.error("Error occurred during search:", err); 
    }
    res.send('Search endpoint - Under construction!'); 
});