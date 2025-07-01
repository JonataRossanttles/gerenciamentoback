import express from "express"
import connectToDatabase from "../config/db.js"
import bcrypt from "bcrypt"
import dotenv from 'dotenv';
import jwt from "jsonwebtoken"
import nodemailer from "nodemailer" // Enviar email
import fs from 'fs' // Gestão de arquivos - nativo do node.js
import generator from "generate-password" // gerar senha aleatória
import { ObjectId } from "mongodb";

dotenv.config();
const router = express.Router()


router.post('/criarescola',async (req,res)=>{
    const {nome,cnpj,email,telefone,endereco} = req.body
    if(!nome || !cnpj|| !email || !telefone || !endereco  ) return  res.status(400).json({msg:'Preencha todos os campos!'})

  try {
    const db = await connectToDatabase()
    const escolaExistente = await db.collection('escolas').findOne({ cnpj });
    if (escolaExistente) {
    return res.status(409).json({ msg: "Escola já cadastrada" });
        }
    const hoje = new Date();
    const criadaem = new Date(hoje).toLocaleDateString("pt-BR")
    const result = await db.collection('escolas').insertOne({nome,cnpj,email,telefone,endereco,criadaem,status:true})
    
    const escolaId = new ObjectId(result.insertedId) 
    const update = await db.collection('escolas').updateOne({_id:escolaId},{$set:{escolaId:escolaId}},{upsert: true} )
    res.status(200).json({msg:'Escola criada com sucesso'})
    
  } catch (error) {
    res.status(400).json({msg:error})
  }

})

router.post('/login',async (req, res) => {
    const db =   await connectToDatabase();
    const email = req.body.email;
    const senha = req.body.senha;
    
    if (!email || !senha) return res.status(400).json({ msg: "Preencha todos os campos!" });
    const resposta =  await db.collection('usuarios').findOne({email:email})
    const escolaId = resposta.escolaId
    if(!resposta) return res.status(400).json({ msg: "Usuário não cadastrado!" });

    const verify = await bcrypt.compare(senha, resposta.senha);

  if (verify == true){
    const token = jwt.sign({nome:resposta.nome,email:resposta.email,escolaId,tipo:resposta.tipo},process.env.SECRET_KEY,{expiresIn: '1h'})
    return res.status(200).cookie('token',token,{httpOnly: true,maxAge: 3600000,sameSite: 'none', secure: true }).json({ nome:resposta.nome , tipo:resposta.tipo }) // 1 HORA

  } else{
    return res.status(400).json({msg:"Senha incorreta!"})
  } 
   
})
router.post('/cadastraruser',async (req, res) => {
    const db =   await connectToDatabase();
    const nome = req.body.nome;
    const email = req.body.email.toLowerCase();
    const tipo = req.body.tipo;
    const hoje = new Date();
    const dataformatada = new Date(hoje).toLocaleDateString("pt-BR")

    try{
        if (!nome || !email  || !tipo){
       return res.status(400).json({msg:"Preencha todos os campos!"})
    }
    const token = req.cookies.token;
   
    const verifytoken = jwt.verify(token, process.env.SECRET_KEY);
   
    //const {escolaId} = verifytoken
    const emailExistente = await db.collection('usuarios').findOne({email: email});

    if(verifytoken){
      
      if(emailExistente){ //Verifica se o E-mail já existe
        return res.status(400).json({msg:"E-mail já cadastrado!"});
      }
      const escolaId =  new ObjectId(verifytoken.escolaId) 
      
           const senha = generator.generate({
            length: 12,
            numbers: true,
            symbols: true,
            uppercase: true,
            lowercase: true,
            strict: true,
          });
          
          const senhacrypt = await bcrypt.hash(senha,10)
          
        const result =   await db.collection('usuarios').insertOne({nome: nome, email: email,senha:senhacrypt, tipo: tipo, criadoEm:dataformatada,status:true,escolaId})
        const userId = new ObjectId(result.insertedId)  
        const resultado = await db.collection('usuarios').updateOne({_id:userId},{$set:{userId:userId}},{upsert: true})
        
        const htmlContent = fs.readFileSync("src/password-user.html", "utf-8").replace('{{usuario}}', email).replace('{{senha}}',senha);
            //Configurações do Email
            
          const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: process.env.EMAIL,
            pass: process.env.SENHA_EMAIL
          }
          });
           
          //Informações que vão no E-mail
          const mailOptions = {
            from: process.env.EMAIL,
            to: email,
            subject: "Cadastro de usuário",
            html:htmlContent,
            text: `Login: ${email} e senha: ${senhacrypt}`
          };
         
          transporter.sendMail(mailOptions, (erro, info) => {
            if (erro) {
              return res.status(400).json({msg:erro})
            } else {
              return res.status(200).json({msg:`"Email enviado com sucesso!" ${info}`})
            }
           
          // Caso for usar o Resend (Precisa ter o domínio próprio já comprado)
          /*
          const resend = new Resend(process.env.RESEND_API_KEY);

          await resend.emails.send({
            from: 'sua-conta@seudominio.com',
            to: 'destinatario@exemplo.com',
            subject: 'Teste com Resend!',
            html: '<strong>Olá! Este é um teste de envio com domínio próprio.</strong>',
          });*/

});

      return res.status(200).json({msg: "Usuário cadastrado com sucesso!"});
    } else{
      return res.status(403).json({msg:"Token inválido!"});
    }

    }catch(error){
       return res.status(500).json({msg:"Erro ao cadastrar usuário"});
    }


})
router.post('/primeirouser', async (req,res)=>{
    const db =   await connectToDatabase();
    const nome = req.body.nome;
    const email = req.body.email.toLowerCase();
    const tipo = req.body.tipo;
    const senha = req.body.senha;
    const ID = req.body.escolaId
    const escolaId = new ObjectId(ID)
    const hoje = new Date();
    const dataformatada = new Date(hoje).toLocaleDateString("pt-BR")
    const senhacrypt = await bcrypt.hash(senha,10)
   const result =  await db.collection('usuarios').insertOne({nome: nome, email: email,senha:senhacrypt, tipo: tipo, data:dataformatada,status:true,escolaId})
   const userId = new ObjectId(result.insertedId)  
   const resultado = await db.collection('usuarios').updateOne({_id:userId},{$set:{userId:userId}},{upsert: true})
   
   res.status(200).json({msg:'usuário cadastrado!'})
})

export default router
