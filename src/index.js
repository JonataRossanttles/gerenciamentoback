import express from "express"
import router from "./rotas/rotas.js"
import dotenv from "dotenv"
import cookieParser from 'cookie-parser';
import cors from "cors"
dotenv.config()
const app = express()
const port = process.env.PORT || 3000

app.use(cors({
    origin:["http://192.168.50.71:5173", "https://gerenciamentofront-9ruo-ten.vercel.app"],
    credentials:true
}))

app.use(express.json())
app.use(cookieParser())
app.use('/',router)


app.listen(port,()=>{
    console.log(`Rodando na porta ${port}`)
})


