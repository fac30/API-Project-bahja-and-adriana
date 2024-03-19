import express from "express";
import dotenv from 'dotenv';


const app = express();
const PORT = 3000;

app.use(express.json());

app.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`))

app.get('/', (req, res) => {
    res.send('Hello from Bahjas and Adrianas Project! :)')
})