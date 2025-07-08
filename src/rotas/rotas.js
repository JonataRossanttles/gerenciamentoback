import express from "express"
import connectToDatabase from "../config/db.js"
import bcrypt from "bcrypt"
import dotenv from 'dotenv';
import jwt from "jsonwebtoken"
import nodemailer from "nodemailer" // Enviar email
import fs from 'fs' // Gestão de arquivos - nativo do node.js
import generator from "generate-password" // gerar senha aleatória
import { ObjectId } from "mongodb";
import cookieParser from "cookie-parser";

dotenv.config();
const router = express.Router()

// Rotas para usuário
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
    const criadaem = new Date(hoje).toISOString()
    const result = await db.collection('escolas').insertOne({nome,cnpj,email,telefone,endereco,criadaem,status:true})
    
    const escolaId = new ObjectId(result.insertedId) 
    const update = await db.collection('escolas').updateOne({_id:escolaId},{$set:{escolaId:escolaId}},{upsert: true} )
    res.status(200).json({msg:'Escola criada com sucesso'})
    
  } catch (error) {
    res.status(400).json({msg:error.message})
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

router.post('/criaruser',async (req, res) => {
    const db =   await connectToDatabase();
    const nome = req.body.nome;
    const email = req.body.email.toLowerCase();
    const tipo = req.body.tipo;
    const hoje = new Date();
    const dataformatada = new Date(hoje).toISOString()

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
          if(tipo=="prof"){
            var dadosdb = {
              nome: nome,
               email: email,
               senha:senhacrypt, 
               tipo: tipo,
                criadoEm:dataformatada,
                status:true,
                escolaId,
                turmas:[],
                disciplinas:[]
            }
          }else{
            var dadosdb = {
              nome: nome,
               email: email,
               senha:senhacrypt, 
               tipo: tipo,
                criadoEm:dataformatada,
                status:true,
                escolaId
            }
          }
          
        const result =   await db.collection('usuarios').insertOne(dadosdb)
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
    const dataformatada = new Date(hoje).toISOString()
    const senhacrypt = await bcrypt.hash(senha,10)
       if(tipo=="prof"){
            var dadosdb = {
              nome: nome,
               email: email,
               senha:senhacrypt, 
               tipo: tipo,
                criadoEm:dataformatada,
                status:true,
                escolaId,
                turmas:[],
                disciplinas:[]
            }
          }else{
            var dadosdb = {
              nome: nome,
               email: email,
               senha:senhacrypt, 
               tipo: tipo,
                criadoEm:dataformatada,
                status:true,
                escolaId
            }
          }
   const result =  await db.collection('usuarios').insertOne(dadosdb)
   const userId = new ObjectId(result.insertedId)  
   const resultado = await db.collection('usuarios').updateOne({_id:userId},{$set:{userId:userId}},{upsert: true})
   
   res.status(200).json({msg:'usuário cadastrado!'})
})

router.post('/aluno/criar', async (req,res)=>{

const db = await connectToDatabase();
const token = req.cookies.token

const verify = jwt.verify(token,process.env.SECRET_KEY)
if(!verify){
  return res.status(400).json({msg:'Faça login novamente!'})
}
const escolaId = new ObjectId(verify.escolaId)
  const {
    nome,
    dataNascimento,
    sexo,
    endereco,
    nomeResponsavel,
    telefoneResponsavel,
    emailResponsavel,
  } = req.body;

  if(!nome || !dataNascimento || !nomeResponsavel){
    return res.status(400).json({msg:'Preencha os campos obrigatórios!'})
  }

  try {

    // Geração automática da matrícula
    let matricula
    let existe;
    // Verificar se existe a matrícula no banco
  do {
    matricula = `ALU${Math.floor(100000 + Math.random() * 900000)}`;
    existe = await db.collection('alunos').findOne({ matricula });
  } while (existe)
    
    const anoLetivo = new Date().getFullYear();
    const situacao = "Ativo";
    const dataNascimentoformatada = new Date(dataNascimento).toLocaleDateString("pt-BR")

    const novoAluno = {
      nome,
      dataNascimento:dataNascimentoformatada,
      sexo: sexo || null,
      endereco: endereco || null,
      nomeResponsavel,
      telefoneResponsavel: telefoneResponsavel || null,
      emailResponsavel: emailResponsavel?.toLowerCase() || null,
      matricula,
      anoLetivo,
      situacao,
      turmaId: null, // Vincula depois
      criadoEm: new Date().toISOString(),
      escolaId:escolaId
    };

  const cadastro = await db.collection('alunos').insertOne(novoAluno)
  const alunoId = new ObjectId(cadastro.insertedId) 
    const insercaoid = await db.collection('alunos').updateOne({_id:alunoId},{$set :{alunoId:alunoId} },{upsert:true})
  return res.status(200).json({msg:'Aluno cadastrado com sucesso!'})
    
  } catch (error) {
   return res.status(400).json({msg:'Erro ao cadastro aluno!'})
  }

})

//Rotas para turmas
router.post('/turma/criar', async (req,res)=>{

const db = await connectToDatabase();

try {
  const {nome,serie,turno,anoLetivo,sala} = req.body
if(!nome || !serie || !turno || !anoLetivo){
  return res.status(400).json({msg:'Preencha os campos obrigatórios!'})
}

const token = req.cookies.token
const verify = jwt.verify(token,process.env.SECRET_KEY)
if(!verify){
  return res.status(400).json({msg:'Faça login novamente!'})
}
const escolaId = new ObjectId(verify.escolaId)

  const novaTurma = {
      nome,
      serie,
      turno,
      anoLetivo,
      sala: sala || null,
      alunos: [],
      professores:[],
      disciplinas:[],
      criadoEm: new Date().toISOString(),
      escolaId
    };
    const cadastro = await db.collection('turmas').insertOne(novaTurma)
    const turmaId =  new ObjectId(cadastro.insertedId)  
    const insercaoid = await db.collection('turmas').updateOne({_id:turmaId},{$set :{turmaId:turmaId} },{upsert:true})

    return res.status(200).json({msg:'Turma criada com sucesso!'})
} catch (error) {
  return res.status(400).json({msg:'erro ao criar turma!'})
}

})

router.post('/turma/adicionaralunos', async (req,res)=>{
  const db = await connectToDatabase()
  const {turmaId,alunos} = req.body

  if (!turmaId || !alunos){
    return res.status(400).json({msg:'Preencha os campos obrigatórios!'})
  }

  try {
    const TurmaObjectId = new ObjectId(turmaId) 
    const AlunosObjectId = alunos.map(id => new ObjectId(id))

  const addalunos = await db.collection('turmas').updateOne({_id:TurmaObjectId},{$addToSet:{alunos:{$each:AlunosObjectId}}})
  const addturma =  await db.collection('alunos').updateMany(
  { _id: { $in: AlunosObjectId } },
  { $set: { turmaId: TurmaObjectId } }
);
 return res.status(200).json({msg:'Alunos adicionados com sucesso!'})
  } catch (error) {
    return res.status(400).json({msg:error.message})
  }
 

})

router.post('/turma/alteraralunos', async(req,res)=>{
 const db = await connectToDatabase()
  const {turmaantigaId,turmanovaId,alunos} = req.body

  if (!turmaantigaId || !turmanovaId || !alunos){
    return res.status(400).json({msg:'Preencha os campos obrigatórios!'})
  }

  try {
    const TurmaantigaObjId = new ObjectId(turmaantigaId) 
    const TurmanovaObjId = new ObjectId(turmanovaId) 
    const AlunosObjId = alunos.map(id => new ObjectId(id))

  const up_alunos_turmanova = await db.collection('alunos').updateMany({ _id: { $in: AlunosObjId } },
  { $set: { turmaId: TurmanovaObjId } })
   
  const up_turmaantiga =  await db.collection('turmas').updateOne({_id:TurmaantigaObjId},{$pull:{alunos:{$in:AlunosObjId}}});
 
 const up_novaturma = await db.collection('turmas').updateOne({_id:TurmanovaObjId},{$addToSet:{alunos:{$each:AlunosObjId}}}) 
 
  return res.status(200).json({msg:'Alunos alterados para a nova turma com sucesso!'})
  } catch (error) {
    return res.status(400).json({msg:error.message})
  }
 

})

router.post('/turma/adicionardisc', async (req,res)=>{
  const db = await connectToDatabase()
  const {turmaId,disciplinas} = req.body

  if (!turmaId || !disciplinas){
    return res.status(400).json({msg:'Preencha os campos obrigatórios!'})
  }

  try {
    const TurmaObjectId = new ObjectId(turmaId) 
    const DisciplinasObjectId = disciplinas.map(id => new ObjectId(id))

  const addalunos = await db.collection('turmas').updateOne({_id:TurmaObjectId},{$addToSet:{disciplinas:{$each:DisciplinasObjectId}}})
  const addturma =  await db.collection('disciplinas').updateMany(
  { _id: { $in: DisciplinasObjectId } },
  { $addToSet: { turmas: { $each: [TurmaObjectId] } } }
);
 return res.status(200).json({msg:'Disciplinas adicionadas com sucesso!'})
  } catch (error) {
    return res.status(400).json({msg:error.message})
  }
 

})

router.post('/turma/alterardisc', async (req,res)=>{
  const db = await connectToDatabase()
  const {turmaId,disciplinas} = req.body

  if (!turmaId || !disciplinas){
    return res.status(400).json({msg:'Preencha os campos obrigatórios!'})
  }

  try {
    const TurmaObjectId = new ObjectId(turmaId) 
    const DisciplinasObjectId = disciplinas.map(id => new ObjectId(id))

  const addalunos = await db.collection('turmas').updateOne({_id:TurmaObjectId},{$pull:{disciplinas:{$in:DisciplinasObjectId}}})
  const addturma =  await db.collection('disciplinas').updateMany(
  { _id: { $in: DisciplinasObjectId } },
  { $pull: { turmas: { $in: [TurmaObjectId] } } }
);
 return res.status(200).json({msg:'Disciplinas removidas com sucesso!'})
  } catch (error) {
    return res.status(400).json({msg:error.message})
  }
 

})

router.post('/turma/adicionarprof', async (req,res)=>{
  const db = await connectToDatabase()
  const {turmaId,professores} = req.body

  if (!turmaId || !professores){
    return res.status(400).json({msg:'Preencha os campos obrigatórios!'})
  }

  try {
    const TurmaObjectId = new ObjectId(turmaId) 
    const ProfessoresObjectId = professores.map(id => new ObjectId(id))

  const addalunos = await db.collection('turmas').updateOne({_id:TurmaObjectId},{$addToSet:{professores:{$each:ProfessoresObjectId}}})
  const addturma =  await db.collection('usuarios').updateMany(
  { _id: { $in: ProfessoresObjectId } },
  { $addToSet: { turmas: { $each: [TurmaObjectId] } } }
);
 return res.status(200).json({msg:'Professores adicionados com sucesso!'})
  } catch (error) {
    return res.status(400).json({msg:error.message})
  }
 

})

router.post('/turma/alterarprof', async (req,res)=>{
  const db = await connectToDatabase()
  const {turmaantigaId,turmanovaId,professores} = req.body

  if (!turmaantigaId || !turmanovaId || !professores){
    return res.status(400).json({msg:'Preencha os campos obrigatórios!'})
  }

  try {
    const TurmaantigaObjId = new ObjectId(turmaantigaId) 
    const TurmanovaObjId = new ObjectId(turmanovaId) 
    const ProfessoresObjId = professores.map(id => new ObjectId(id))

  const up_prof_turmanova = await db.collection('usuarios').updateMany({ _id: { $in: ProfessoresObjId } },
  { $addToSet: { turmas: TurmanovaObjId } })

  const apagar_turma_antiga = await db.collection('usuarios').updateMany({ _id: { $in: ProfessoresObjId } },
  { $pull: { turmas: TurmaantigaObjId } })
 
  const up_turmaantiga =  await db.collection('turmas').updateOne({_id:TurmaantigaObjId},{$pull:{professores:{$in:ProfessoresObjId}}});
 
 const up_novaturma = await db.collection('turmas').updateOne({_id:TurmanovaObjId},{$addToSet:{professores:{$each:ProfessoresObjId}}}) 
 
  return res.status(200).json({msg:'Professores alterados para nova turma com sucesso!'})
  } catch (error) {
    return res.status(400).json({msg:error.message})
  }
 

})


// Rotas para as disciplinas
router.post('/disciplina/criar', async (req,res)=>{

const db = await connectToDatabase();

const {nome,descricao,cargaHoraria,anoLetivo} = req.body

if(!nome || !descricao || !cargaHoraria || !anoLetivo){
  return res.status(400).json({msg:'Preencha os campos obrigatórios!'})
}

try {

const token = req.cookies.token
const verify = jwt.verify(token,process.env.SECRET_KEY)
if(!verify){
  return res.status(400).json({msg:'Faça login novamente!'})
}
const escolaId = new ObjectId(verify.escolaId)

    let codigo
    let existe;
    // Verificar se existe a matrícula no banco
  do {
    codigo = `DISC${Math.floor(100000 + Math.random() * 900000)}`;
    existe = await db.collection('disciplinas').findOne({ codigo });
  } while (existe)

  const novaDisciplina = {
      nome,
      descricao,
      cargaHoraria,
      codigo,
      anoLetivo,
      alunos: [],
      professores:[],
      turmas:[],
      criadoEm: new Date().toISOString(),
      escolaId
    };
    const cadastro = await db.collection('disciplinas').insertOne(novaDisciplina)
    const codigoDisc = new ObjectId(cadastro.insertedId) 
    const insercaoid = await db.collection('disciplinas').updateOne({_id:codigoDisc},{$set :{discId:codigoDisc} },{upsert:true})
    return res.status(200).json({msg:'Disciplina criada com sucesso!'})
} catch (error) {
  return res.status(400).json({msg:'Erro ao criar disciplina!'})
}

  
})




export default router
