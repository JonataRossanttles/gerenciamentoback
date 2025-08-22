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
    return res.status(200).cookie('token',token,{httpOnly: true,maxAge: 3600000,sameSite: 'lax', secure: false }).json({ nome:resposta.nome , tipo:resposta.tipo }) // 1 HORA
     //trocar por sameSite:none
  } else{
    return res.status(400).json({msg:"Senha incorreta!"})
  } 
   
})

router.post('/criaruser',async (req, res) => {
    const db =   await connectToDatabase();
    const nome = req.body.dados.nome;
    const email = req.body.dados.email.toLowerCase();
    const tipo = req.body.dados.tipo;
    const hoje = new Date();
    const dataformatada = new Date(hoje).toISOString()
    
const token = req.cookies.token;
 if (!token) {
    return res.status(401).json({ msg: 'Token ausente' });
  }
    const verify = jwt.verify(token,process.env.SECRET_KEY)
    if(!verify){
      return res.status(401).json({msg:'Faça login novamente!'})
    }

    try{
        if (!nome || !email  || !tipo){
       return res.status(400).json({msg:"Preencha todos os campos!"})
    }
    

    //const {escolaId} = verify
    const emailExistente = await db.collection('usuarios').findOne({email: email});
    console.log(emailExistente)
    if(verify){
      console.log('primeira etapa')
      if(emailExistente){ //Verifica se o E-mail já existe
        return res.status(400).json({msg:"E-mail já cadastrado!"});
      }
      const escolaId =  new ObjectId(verify.escolaId) 
      console.log('segunda etapa')
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
 const {
    nome,
    dataNascimento,
    sexo,
    endereco,
    nomeResponsavel,
    telefoneResponsavel,
    emailResponsavel,
  } = req.body.dados;

const token = req.cookies.token
 if (!token) {
    return res.status(401).json({ msg: 'Token ausente' });
  }
const verify = jwt.verify(token,process.env.SECRET_KEY)
if(!verify){
  return res.status(401).json({msg:'Faça login novamente!'})
}
 
try {

const escolaId = new ObjectId(verify.escolaId)
if(!nome || !dataNascimento || !nomeResponsavel || !telefoneResponsavel || !endereco 
    || !emailResponsavel || !sexo){
  return res.status(400).json({msg:'Preencha os campos obrigatórios!'})
}
    // Geração automática da matrícula
    let matricula
    let existe;
    // Verificar se existe a matrícula no banco
  do {
    matricula = `ALU${Math.floor(100000 + Math.random() * 900000)}`;
    existe = await db.collection('alunos').findOne({ matricula });
  } while (existe)
    
    const anoLetivo = new Date().getFullYear();
    const situacao = "ATIVO";
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

const token = req.cookies.token
 if (!token) {
    return res.status(401).json({ msg: 'Token ausente' });
  }
const verify = jwt.verify(token,process.env.SECRET_KEY)
if(!verify){
  return res.status(401).json({msg:'Faça login novamente!'})
}

try {
 
  const {turma,serie,turno,anoLetivo,sala} = req.body.dados
if(!turma || !serie || !turno || !anoLetivo || !sala){
  return res.status(400).json({msg:'Preencha os campos obrigatórios!'})
}

const escolaId = new ObjectId(verify.escolaId)

  const novaTurma = {
      turma: turma.trim(),
      serie: serie.trim(),
      turno: turno.trim(),
      anoLetivo,
      sala: sala.trim() || null,
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
  return res.status(400).json({msg:'Erro ao criar turma!'})
}

})

router.post('/turma/adicionaralunos', async (req,res)=>{
  const db = await connectToDatabase()
  const {turmaId,alunosId} = req.body.dados


const token = req.cookies.token
 if (!token) {
    return res.status(401).json({ msg: 'Token ausente' });
  }
const verify = jwt.verify(token,process.env.SECRET_KEY)
if(!verify){
  return res.status(401).json({msg:'Faça login novamente!'})
}
  if (!turmaId || !alunosId){
    return res.status(400).json({msg:'Preencha os campos obrigatórios!'})
  }

  try {
    const TurmaObjectId = new ObjectId(turmaId) 
    const AlunosObjectId = alunosId.map(id => new ObjectId(id))

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
  const {turmaId,disciplinasId} = req.body.dados
  const token = req.cookies.token
  if (!token) {
      return res.status(401).json({ msg: 'Token ausente' });
    }
  const verify = jwt.verify(token,process.env.SECRET_KEY)
  if(!verify){
    return res.status(401).json({msg:'Faça login novamente!'})
  }
  if (!turmaId || !disciplinasId){
    return res.status(400).json({msg:'Preencha os campos obrigatórios!'})
  }

  try {
    const TurmaObjectId = new ObjectId(turmaId) 
    const DisciplinasObjectId = disciplinasId.map(id => new ObjectId(id))

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
  const {turmaId,professoresId} = req.body.dados
    const token = req.cookies.token
  if (!token) {
      return res.status(401).json({ msg: 'Token ausente' });
    }
  const verify = jwt.verify(token,process.env.SECRET_KEY)
  if(!verify){
    return res.status(401).json({msg:'Faça login novamente!'})
  }

  if (!turmaId || !professoresId){
    return res.status(400).json({msg:'Preencha os campos obrigatórios!'})
  }

  try {
    const TurmaObjectId = new ObjectId(turmaId) 
    const ProfessoresObjectId = professoresId.map(id => new ObjectId(id))

  const addProfessores = await db.collection('turmas').updateOne({_id:TurmaObjectId},{$addToSet:{professores:{$each:ProfessoresObjectId}}})
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

const {nome,descricao,cargaHoraria,anoLetivo} = req.body.dados

const token = req.cookies.token
if (!token) {
    return res.status(401).json({ msg: 'Token ausente' });
  }
const verify = jwt.verify(token,process.env.SECRET_KEY)
if(!verify){
  return res.status(401).json({msg:'Faça login novamente!'})
}

try {

if(!nome || !descricao || !cargaHoraria || !anoLetivo){
  return res.status(400).json({msg:'Preencha os campos obrigatórios!'})
}
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
router.post('/disciplina/adicionarprof', async (req,res)=>{
  const db = await connectToDatabase()
  const {disciplina,professores} = req.body

  if (!disciplina || !professores || professores.length==0){
    return res.status(400).json({msg:'Preencha os campos obrigatórios!'})
  }

  try {
    const DisciplinaObjectId = new ObjectId(disciplina)
    const ProfessoresObjectId = professores.map(id => new ObjectId(id))

  const addprof = await db.collection('disciplinas').updateOne({_id:DisciplinaObjectId},{$addToSet:{professores:{$each:ProfessoresObjectId}}})
  const adddisciplinas =  await db.collection('usuarios').updateMany(
  {_id:{$in: ProfessoresObjectId}},
  {$addToSet:{disciplinas:DisciplinaObjectId}}
);
 return res.status(200).json({msg:'Professores adicionados com sucesso!'})
  } catch (error) {
    return res.status(400).json({msg:error.message})
  }
 
})
router.post('/disciplina/alterarprof', async (req,res)=>{
  const db = await connectToDatabase()
  const {discantigaId,discnovaId,professores} = req.body

  if (!discantigaId || !discnovaId || !professores || professores.length==0){
    return res.status(400).json({msg:'Preencha os campos obrigatórios!'})
  }

  try {
    const DiscantigaObjId = new ObjectId(discantigaId) 
    const DiscnovaObjId = new ObjectId(discnovaId) 
    const ProfessoresObjId = professores.map(id => new ObjectId(id))

  const up_prof_discnova = await db.collection('usuarios').updateMany({ _id: { $in: ProfessoresObjId } },
  { $addToSet: { disciplinas: DiscnovaObjId } })

  const apagar_disc_antiga = await db.collection('usuarios').updateMany({ _id: { $in: ProfessoresObjId } },
  { $pull: { disciplinas: DiscantigaObjId } })
 
  const up_discantiga =  await db.collection('disciplinas').updateOne({_id:DiscantigaObjId},{$pull:{professores:{$in:ProfessoresObjId}}});
 
 const up_novadisc = await db.collection('disciplinas').updateOne({_id:DiscnovaObjId},{$addToSet:{professores:{$each:ProfessoresObjId}}}) 
 
  return res.status(200).json({msg:'Professores alterados para nova disciplina com sucesso!'})
  } catch (error) {
    return res.status(400).json({msg:error.message})
  }
 

})

// Criar rotas para consultas

router.post('/consultar/turmas',async (req,res)=>{
  const db = await connectToDatabase()
  const {anoLetivo} = req.body.dados

  const token = req.cookies.token
 if (!token) {
    return res.status(401).json({ msg: 'Token ausente' });
  }
const verify = jwt.verify(token,process.env.SECRET_KEY)
if(!verify){
  return res.status(401).json({msg:'Faça login novamente!'})
}
  
    try {
      if(!anoLetivo) return res.status(400).json({msg:'Preencha o campo obrigatório!'})
        console.log(anoLetivo)
        if(anoLetivo == "todos"){
          const consultarturmas = await db.collection("turmas").find({projection:{alunos:0,professores:0,disciplinas:0,_id:0}}).toArray()
          return res.status(200).json({msg:consultarturmas})
        }
      const consultarturmas = await db.collection("turmas").find({anoLetivo:Number(anoLetivo)},{projection:{alunos:0,professores:0,disciplinas:0,_id:0}}).toArray()
      return res.status(200).json({msg:consultarturmas})
    } catch (error) {
       return res.status(400).json({msg:error.message})
    }

})
router.post('/consultar/disciplinas',async (req,res)=>{
  const db = await connectToDatabase()
  const {anoLetivo} = req.body.dados

const token = req.cookies.token
 if (!token) {
    return res.status(401).json({ msg: 'Token ausente' });
  }
const verify = jwt.verify(token,process.env.SECRET_KEY)
if(!verify){
  return res.status(401).json({msg:'Faça login novamente!'})
}

    try {
        console.log(anoLetivo)
       if(!anoLetivo) return res.status(400).json({msg:'Preencha o campo obrigatório!'})
      const consultardisc = await db.collection("disciplinas").find({anoLetivo:anoLetivo},{projection:{professores:0,turmas:0,escolaId:0,_id:0}}).toArray()
      
      return res.status(200).json({msg:consultardisc})
    } catch (error) {
       return res.status(400).json({msg:error.message})
    }

})
router.get('/consultar/professores',async (req,res)=>{
  const db = await connectToDatabase()
  
    try {
      const consultarprof = await db.collection("usuarios").find({tipo:"prof"},{projection:{senha:0}}).toArray()
      return res.status(200).json({msg:consultarprof})
    } catch (error) {
       return res.status(400).json({msg:error.message})
    }

})
router.get('/consultar/disciplinas',async (req,res)=>{
  const db = await connectToDatabase()
    const token = req.cookies.token
 if (!token) {
    return res.status(401).json({ msg: 'Token ausente' });
  }
const verify = jwt.verify(token,process.env.SECRET_KEY)
if(!verify){
  return res.status(401).json({msg:'Faça login novamente!'})
}
    try {
      const consultardisc = await db.collection("disciplinas").find({},{projection:{professores:0,turmas:0,escolaId:0,_id:0}}).toArray()
      return res.status(200).json({msg:consultardisc})
    } catch (error) {
       return res.status(400).json({msg:error.message})
    }

})
router.post('/consultar/alunos',async (req,res)=>{
  const db = await connectToDatabase()
  const {situacao} = req.body.dados
 
  const token = req.cookies.token
 if (!token) {
    return res.status(401).json({ msg: 'Token ausente' });
  }
const verify = jwt.verify(token,process.env.SECRET_KEY)
if(!verify){
  return res.status(401).json({msg:'Faça login novamente!'})
}

  if(!situacao || typeof situacao !== 'string') return res.status(400).json({msg:'Preencha o campo obrigatório!'})
  
    try {

      if(situacao==="TODOS"){
        var consultaralunos = await db.collection("alunos").find().toArray()
      }else{
         var consultaralunos = await db.collection("alunos").find({situacao:situacao}).toArray()
      }
     
      return res.status(200).json({msg:consultaralunos})
    } catch (error) {
       return res.status(400).json({msg:error.message})
    }

})
router.post('/consultar/usuarios',async (req,res)=>{
  const db = await connectToDatabase()
  const {status} = req.body.dados

  const token = req.cookies.token
 if (!token) {
    return res.status(401).json({ msg: 'Token ausente' });
  }
const verify = jwt.verify(token,process.env.SECRET_KEY)
if(!verify){
  return res.status(401).json({msg:'Faça login novamente!'})
}
  
    try {
      if(!status) return res.status(400).json({msg:'Preencha o campo obrigatório!'})
        if(status === 'todos') {
          const consultarusuarios = await db.collection("usuarios").find({},{projection:{turmas:0,senha:0,disciplinas:0,_id:0,escolaId:0}}).toArray()
          return res.status(200).json({msg:consultarusuarios})
        }else{
          if(status === 'ativo'){
            var value = true
          } 
          if(status === 'inativo'){
            var value = false
          } 
          const consultarusuarios = await db.collection("usuarios").find({status:value},{projection:{turmas:0,senha:0,disciplinas:0,_id:0,escolaId:0}}).toArray()
          return res.status(200).json({msg:consultarusuarios})
        }
      
    } catch (error) {
       return res.status(400).json({msg:error.message})
    }

})
router.post('/consultar/turma/disciplinas',async (req,res)=>{
  const db = await connectToDatabase()
  const {turmaId} = req.body.dados

  const token = req.cookies.token
 if (!token) {
    return res.status(401).json({ msg: 'Token ausente' });
  }
const verify = jwt.verify(token,process.env.SECRET_KEY)
if(!verify){
  return res.status(401).json({msg:'Faça login novamente!'})
}

  const TurmaobjId = new ObjectId(turmaId)

  if(!turmaId) return res.status(400).json({msg:'Preencha o campo obrigatório!'})

    try {
      const consultardisc = await db.collection("turmas").aggregate([
        { 
          $match: { _id: TurmaobjId }
        },
        {
          $lookup:{
            from:"disciplinas",
            localField:"disciplinas",
            foreignField: "_id",
            pipeline:[
              {
                $project:{
                  escolaId:0,
                  turmas:0,
                  _id:0,
                  professores:0
                }
              }
            ],
            as: "dadosdisciplinas" 
          }},{
        $project: {
      // Campos da coleção turmas que você quer esconder:
      alunos: 0,
      professores: 0,
      disciplinas:0,
      escolaId:0,
      _id:0
    }
  }
      ]).toArray()
      
      return res.status(200).json({msg:consultardisc})
    } catch (error) {
       return res.status(400).json({msg:error.message})
    }

})
router.post('/consultar/turma/professores',async (req,res)=>{
  const db = await connectToDatabase()
  const {turmaId} = req.body.dados

  const token = req.cookies.token
 if (!token) {
    return res.status(401).json({ msg: 'Token ausente' });
  }
const verify = jwt.verify(token,process.env.SECRET_KEY)
if(!verify){
  return res.status(401).json({msg:'Faça login novamente!'})
}

  const TurmaobjId = new ObjectId(turmaId)

  if(!turmaId) return res.status(400).json({msg:'Preencha o campo obrigatório!'})

    try {
      const consultarprof = await db.collection("turmas").aggregate([
        { 
          $match: { _id: TurmaobjId }
            } ,
        {
          $lookup:{
            from:"usuarios", // Nome da coleção em que vou buscar os dados
            localField:"professores", // Campo do documento da coleção turmas
            foreignField: "_id", // Campo da coleção usuarios que vou comparar com o campo professores da coleção turmas.
            pipeline:[
              {
                $match: { tipo: "prof" } // só pega usuários do tipo prof
              },
              {
                $project:{
                  senha:0,
                  turmas:0,
                  _id:0,
                  disciplinas:0,
                  escolaId:0
                }
              }
            ],
            as: "dadosprofessores" 
          }},
          {
        $project: {
      // Campos da coleção turmas que você quer esconder:
      alunos: 0,
      professores: 0,
      disciplinas:0,
      escolaId:0,
      _id:0
    }
  }
      ]).toArray()
      
      return res.status(200).json({msg:consultarprof})
    } catch (error) {
       return res.status(400).json({msg:error.message})
    }

})
router.post('/consultar/turma/alunos',async (req,res)=>{
  const db = await connectToDatabase()
  const {turmaId} = req.body.dados

  const TurmaobjId = new ObjectId(turmaId)

  if(!turmaId) return res.status(400).json({msg:'Preencha o campo obrigatório!'})
  
    try {
      const consultaralunos = await db.collection("turmas").aggregate([
        { 
          $match: { _id: TurmaobjId } // Documento dentro de turmas
        },
        {
          $lookup:{
            localField:"alunos", // Campo do documento da coleção turmas
            from:"alunos", // Coleção onde eu vou buscar a informação
            foreignField: "_id", // Campo da coleção alunos que vou comparar com o campo alunos da coleção turmas.
            pipeline:[
              {
                $project:{
                  turmaId:0,
                  _id:0,
                  escolaId:0
                }
              }
            ],
            as: "dadosalunos" 
          }},
          {
        $project: {
      // Campos da coleção turmas que você quer esconder:
   dadosalunos: 1

    }
  }
      ]).toArray()
      
      return res.status(200).json({msg:consultaralunos})
    } catch (error) {
       return res.status(400).json({msg:error.message})
    }

})
router.get('/consultar/alunos/semturma',async (req,res)=>{
  const db = await connectToDatabase()
  
 
  const token = req.cookies.token
 if (!token) {
    return res.status(401).json({ msg: 'Token ausente' });
  }
const verify = jwt.verify(token,process.env.SECRET_KEY)
if(!verify){
  return res.status(401).json({msg:'Faça login novamente!'})
}

    try {
        var consultaralunos = await db.collection("alunos").find({turmaId:null},{projection:{matricula:1, nome:1,alunoId:1}}).toArray()     
      return res.status(200).json({msg:consultaralunos})
    } catch (error) {
       return res.status(400).json({msg:error.message})
    }

})

//Criar rotas para Frequência

router.post('/frequencia/registrar',async (req,res)=>{
const db = await connectToDatabase()
const {alunos,turma,disciplina} = req.body
const hoje = new Date();
const dataformatada = new Date(hoje)

if(!turma || !alunos || !disciplina) return res.status(400).json({msg:'Preencha o campo obrigatório!'})

try {
  const turmaobjId = new ObjectId(turma)
  const disciplinaobjId = new ObjectId(disciplina)
  const alunosobjId = alunos.map((element)=>{
      const alunoId = new ObjectId(element.alunoId)
      const dados = {alunoId:alunoId,presenca:element.presenca}
      return dados
  })
  console.log(alunosobjId)
  const dadosfrequencia = {
    alunos:alunosobjId,
    turma:turmaobjId,
    disciplina:disciplinaobjId,
    data:dataformatada
  }
  const inserirfrequencia = await db.collection("frequencia").insertOne(dadosfrequencia)
  return res.status(200).json({msg:'Lista de frequência atualizada com sucesso!'})
} catch (error) {
  return res.status(400).json({msg:error.message})
}


})
router.post('/frequencia/consultar',async (req,res)=>{
const db = await connectToDatabase()
const {data,turma,disciplina} = req.body
const hoje = new Date();
const dataformatada = new Date(hoje)

if(!turma || !data || !disciplina) return res.status(400).json({msg:'Preencha o campo obrigatório!'})

try {
  const turmaobjId = new ObjectId(turma)
  const disciplinaobjId = new ObjectId(disciplina)
  const inicioDoDia = new Date(data);
inicioDoDia.setUTCHours(0, 0, 0, 0);

const fimDoDia = new Date(data);
fimDoDia.setUTCHours(23, 59, 59, 999);
  
  const consultarfreq = await db.collection("frequencia").find({turma:turmaobjId, data: { $gte: inicioDoDia, $lte: fimDoDia },disciplina:disciplinaobjId},
    {projection:{turma:0,data:0,_id:0}}).toArray()
  return res.status(200).json({msg:consultarfreq})
} catch (error) {
  return res.status(400).json({msg:error.message})
}

})

router.post('/frequencia/deletar',async (req,res)=>{
const db = await connectToDatabase()
const {data,turma,disciplina} = req.body
const hoje = new Date();
const dataformatada = new Date(hoje)

if(!turma || !data | !disciplina) return res.status(400).json({msg:'Preencha o campo obrigatório!'})

try {
  const turmaobjId = new ObjectId(turma)
  const disciplinaobjId = new ObjectId(disciplina)
  const inicioDoDia = new Date(data);
inicioDoDia.setUTCHours(0, 0, 0, 0);

const fimDoDia = new Date(data);
fimDoDia.setUTCHours(23, 59, 59, 999);
  
  const consultarfreq = await db.collection("frequencia").deleteOne({
  turma: turmaobjId,
  disciplina: disciplinaobjId,
  data: { $gte: inicioDoDia, $lte: fimDoDia }
})
  return res.status(200).json({msg:'Frequência excluída com sucesso!'})
} catch (error) {
  return res.status(400).json({msg:error.message})
}


})
// Criar rotas para Edição
router.post('/editar/turma',async (req,res)=>{
  const db = await connectToDatabase()

  const token = req.cookies.token
 if (!token) {
    return res.status(401).json({ msg: 'Token ausente' });
  }
const verify = jwt.verify(token,process.env.SECRET_KEY)
if(!verify){
  return res.status(401).json({msg:'Faça login novamente!'})
}
  
    try {
        const {turma,serie,turno,anoLetivo,sala,turmaId} = req.body.dados
      
if(!turma || !serie || !turno || !anoLetivo || !sala || !turmaId){
  return res.status(400).json({msg:'Preencha os campos obrigatórios!'})
}

      const turmaIdobj = new ObjectId(turmaId)
      const anoLetivonumb = Number(anoLetivo)
      const consultarturmas = await db.collection("turmas").updateOne({_id:turmaIdobj},{$set: {turma:turma,serie:serie,turno:turno,anoLetivo:anoLetivonumb,sala:sala}})
      return res.status(200).json({msg:'Dados atualizados com sucesso!'})
    } catch (error) {
       return res.status(400).json({msg:error.message})
    }

})
router.post('/editar/aluno',async (req,res)=>{
  const db = await connectToDatabase()

  const token = req.cookies.token
 if (!token) {
    return res.status(401).json({ msg: 'Token ausente' });
  }
const verify = jwt.verify(token,process.env.SECRET_KEY)
if(!verify){
  return res.status(401).json({msg:'Faça login novamente!'})
}
  const {
    nome,
    dataNascimento,
    sexo,
    endereco,
    nomeResponsavel,
    telefoneResponsavel,
    emailResponsavel,
    situacao,
    alunoId
  } = req.body.dados;
    try {
    
      
if(!nome || !dataNascimento || !nomeResponsavel || !telefoneResponsavel || !situacao || !endereco 
    || !emailResponsavel || !sexo || !endereco.rua || !endereco.cep ||!endereco.estado
     || !endereco.cidade || !endereco.bairro || !endereco.numero){
  return res.status(400).json({msg:'Preencha os campos obrigatórios!'})
}

      const alunoIdobj = new ObjectId(alunoId)
     
      const alunos = await db.collection("alunos").updateOne({_id:alunoIdobj},{$set: {nome:nome,
    dataNascimento:dataNascimento,
    sexo:sexo,
    endereco:endereco,
    nomeResponsavel:nomeResponsavel,
    telefoneResponsavel:telefoneResponsavel,
    emailResponsavel:emailResponsavel,
    situacao:situacao}})
      return res.status(200).json({msg:'Dados atualizados com sucesso!'})
    } catch (error) {
       return res.status(400).json({msg:error.message})
    }

})
router.post('/editar/usuario',async (req,res)=>{
  const db = await connectToDatabase()

  const token = req.cookies.token
 if (!token) {
    return res.status(401).json({ msg: 'Token ausente' });
  }
const verify = jwt.verify(token,process.env.SECRET_KEY)
if(!verify){
  return res.status(401).json({msg:'Faça login novamente!'})
}
  
    try {
        const {nome,tipo,status,userId} = req.body.dados
    
if(!nome || !tipo || status === undefined || !userId ){
  return res.status(400).json({msg:'Preencha os campos obrigatórios!'})
}

      const usuarioIdobj = new ObjectId(userId)

      const usuarios = await db.collection("usuarios").updateOne({_id:usuarioIdobj},{$set: {nome:nome,
        tipo:tipo,status:status}})

      return res.status(200).json({msg:'Dados atualizados com sucesso!'})
    } catch (error) {
       return res.status(400).json({msg:error.message})
    }

})
router.post('/editar/professor',async (req,res)=>{
  const db = await connectToDatabase()

  const token = req.cookies.token
 if (!token) {
    return res.status(401).json({ msg: 'Token ausente' });
  }
const verify = jwt.verify(token,process.env.SECRET_KEY)
if(!verify){
  return res.status(401).json({msg:'Faça login novamente!'})
}
  
    try {
        const {nome,status,userId} = req.body.dados
    
if(!nome || status === undefined || !userId ){
  return res.status(400).json({msg:'Preencha os campos obrigatórios!'})
}

      const usuarioIdobj = new ObjectId(userId)

      const usuarios = await db.collection("usuarios").updateOne({_id:usuarioIdobj},{$set: {nome:nome,
        status:status}})

      return res.status(200).json({msg:'Dados atualizados com sucesso!'})
    } catch (error) {
       return res.status(400).json({msg:error.message})
    }

})
router.post('/editar/disciplina',async (req,res)=>{
  const db = await connectToDatabase()

  const token = req.cookies.token
 if (!token) {
    return res.status(401).json({ msg: 'Token ausente' });
  }
const verify = jwt.verify(token,process.env.SECRET_KEY)
if(!verify){
  return res.status(401).json({msg:'Faça login novamente!'})
}
  
try {
        const {nome,cargaHoraria,anoLetivo,descricao,discId} = req.body.dados
      console.log(req.body.dados)
      if(!nome || !cargaHoraria || !anoLetivo || !descricao || !discId ){
        return res.status(400).json({msg:'Preencha os campos obrigatórios!'})
      }

      const disciplinaIdobj = new ObjectId(discId)
      
      const disciplinas = await db.collection("disciplinas").updateOne({_id:disciplinaIdobj},{$set: {nome:nome,
        cargaHoraria: Number(cargaHoraria),
        anoLetivo:Number(anoLetivo),
        descricao:descricao}})

      return res.status(200).json({msg:'Dados atualizados com sucesso!'})
    } catch (error) {
       return res.status(400).json({msg:error.message})
    }

})


// Rotas para exclusão
router.post('/excluir/turma',async (req,res)=>{
  const db = await connectToDatabase()

  const token = req.cookies.token
 if (!token) {
    return res.status(401).json({ msg: 'Token ausente' });
  }
const verify = jwt.verify(token,process.env.SECRET_KEY)
if(!verify){
  return res.status(401).json({msg:'Faça login novamente!'})
}
  
    try {
        const {turmaId} = req.body.dados
        
if(!turmaId){
  return res.status(400).json({msg:'Preencha os campos obrigatórios!'})
}

      const turmaIdobj =  turmaId.map((element)=> new ObjectId(element))

      const consultarturmas = await db.collection("turmas").deleteMany({_id: { $in: turmaIdobj }})
      const excluirturma_no_aluno = await db.collection("alunos").updateMany({turmaId: { $in: turmaIdobj }},{$set:{turmaId: null}})
      return res.status(200).json({msg:'Turma excluída com sucesso!'})
    } catch (error) {
       return res.status(400).json({msg:error.message})
    }

})
router.post('/excluir/aluno',async (req,res)=>{
  const db = await connectToDatabase()

  const token = req.cookies.token
 if (!token) {
    return res.status(401).json({ msg: 'Token ausente' });
  }
const verify = jwt.verify(token,process.env.SECRET_KEY)
if(!verify){
  return res.status(401).json({msg:'Faça login novamente!'})
}
  
    try {
        const {alunosId} = req.body.dados

if(   alunosId.length == 0  ){
  return res.status(400).json({msg:'Preencha os campos obrigatórios!'})
}

      const alunosIdobj = alunosId.map((element)=> new ObjectId(element))
      const excluiraluno = await db.collection("alunos").deleteMany({_id: { $in: alunosIdobj }})
      const excluiraluno_na_turma = await db.collection("turmas").updateMany({alunos: { $in:alunosIdobj } },{$pull:{alunos:{$in:alunosIdobj}}})
      return res.status(200).json({msg:'Alunos excluídos com sucesso!'})
    } catch (error) {
       return res.status(400).json({msg:error.message})
    }

})
router.post('/excluir/turma/alunos',async (req,res)=>{
  const db = await connectToDatabase()

  const token = req.cookies.token
 if (!token) {
    return res.status(401).json({ msg: 'Token ausente' });
  }
const verify = jwt.verify(token,process.env.SECRET_KEY)
if(!verify){
  return res.status(401).json({msg:'Faça login novamente!'})
}
  
    try {
        const {alunosId,turmaId} = req.body.dados
console.log(alunosId)
if(!alunosId || alunosId.length === 0){
  return res.status(400).json({msg:'Preencha os campos obrigatórios!'})
}

      const alunosIdobj = alunosId.map(id => new ObjectId(id))
      const turmaIdobj = new ObjectId(turmaId)
      const excluiraluno_na_turma = await db.collection("turmas").updateOne({_id:turmaIdobj},{ $pull: { alunos: { $in: alunosIdobj } } })
      const excluirturma_no_aluno = await db.collection("alunos").updateMany({_id: { $in: alunosIdobj }},{$set:{turmaId: null}})
      return res.status(200).json({msg:'Alunos excluídos com sucesso!'})
    } catch (error) {
       return res.status(400).json({msg:error.message})
    }

})
router.post('/excluir/turma/professores',async (req,res)=>{
  const db = await connectToDatabase()

  const token = req.cookies.token
 if (!token) {
    return res.status(401).json({ msg: 'Token ausente' });
  }
const verify = jwt.verify(token,process.env.SECRET_KEY)
if(!verify){
  return res.status(401).json({msg:'Faça login novamente!'})
}
  
    try {
        const {professoresId,turmaId} = req.body.dados
console.log(professoresId)
if(!professoresId || professoresId.length === 0 || !turmaId){
  return res.status(400).json({msg:'Preencha os campos obrigatórios!'})
}

      const professoresIdobj = professoresId.map(id => new ObjectId(id))
      const turmaIdobj = new ObjectId(turmaId)
      const excluirprofessor_na_turma = await db.collection("turmas").updateOne({_id:turmaIdobj},{ $pull: { professores: { $in: professoresIdobj } } })
      const excluirturma_no_professor = await db.collection("usuarios").updateMany({_id: { $in: professoresIdobj }},{ $pull: { turmas:  turmaIdobj } } )
      return res.status(200).json({msg:'Professores excluídos com sucesso!'})
    } catch (error) {
       return res.status(400).json({msg:error.message})
    }

})
router.post('/excluir/turma/disciplinas',async (req,res)=>{
  const db = await connectToDatabase()

  const token = req.cookies.token
 if (!token) {
    return res.status(401).json({ msg: 'Token ausente' });
  }
const verify = jwt.verify(token,process.env.SECRET_KEY)
if(!verify){
  return res.status(401).json({msg:'Faça login novamente!'})
}
  
    try {
        const {discId,turmaId} = req.body.dados
console.log(discId)
if(!discId || discId.length === 0 || !turmaId){
  return res.status(400).json({msg:'Preencha os campos obrigatórios!'})
}

      const discIdobj = discId.map(id => new ObjectId(id))
      const turmaIdobj = new ObjectId(turmaId)
      const excluirdisc_na_turma = await db.collection("turmas").updateOne({_id:turmaIdobj},{ $pull: { disciplinas: { $in: discIdobj } } })
      const excluirturma_no_disciplina = await db.collection("disciplinas").updateMany({_id: { $in: discIdobj }},{ $pull: { turmas:  turmaIdobj } } )
      return res.status(200).json({msg:'Disciplinas excluídas com sucesso!'})
    } catch (error) {
       return res.status(400).json({msg:error.message})
    }

})
router.post('/excluir/usuario',async (req,res)=>{
  const db = await connectToDatabase()

  const token = req.cookies.token
 if (!token) {
    return res.status(401).json({ msg: 'Token ausente' });
  }
const verify = jwt.verify(token,process.env.SECRET_KEY)
if(!verify){
  return res.status(401).json({msg:'Faça login novamente!'})
}
  
    try {
        const {userId} = req.body.dados
       
if(userId.length == 0){
  return res.status(400).json({msg:'Preencha os campos obrigatórios!'})
}

      const userIdobj =  userId.map(id => new ObjectId(id))
     
      const excluiruser = await db.collection("usuarios").deleteMany({_id:{$in: userIdobj}})
      const excluirturma = await db.collection("turmas").updateMany({professores:{$in: userIdobj}},{$pull:{professores:{$in: userIdobj}}})
      const excluirdisciplina = await db.collection("disciplinas").updateMany({professores:{$in: userIdobj}},{$pull:{professores:{$in: userIdobj}}})
      return res.status(200).json({msg:'Usuário(s) excluído(s) com sucesso!'})
    } catch (error) {
       return res.status(400).json({msg:error.message})
    }

})
router.post('/excluir/disciplina',async (req,res)=>{
  const db = await connectToDatabase()

  const token = req.cookies.token
 if (!token) {
    return res.status(401).json({ msg: 'Token ausente' });
  }
const verify = jwt.verify(token,process.env.SECRET_KEY)
if(!verify){
  return res.status(401).json({msg:'Faça login novamente!'})
}
  
    try {
        const {discId} = req.body.dados
       
if(!discId){
  return res.status(400).json({msg:'Preencha os campos obrigatórios!'})
}

      const discIdobj = discId.map(id => new ObjectId(id))
      const excluirdisc = await db.collection("disciplinas").deleteMany({_id:{$in:discIdobj}})
      const excluir_turmas_nas_turmas = await db.collection("turmas").updateMany({disciplinas: {$in:discIdobj}},{$pull : {disciplinas:{$in:discIdobj}}})
      return res.status(200).json({msg:'Disciplina excluída com sucesso!'})
    } catch (error) {
       return res.status(400).json({msg:error.message})
    }

})

// Criar rotas para Avaliações

// Rota para validação do token
router.post('/validartoken', async (req, res) => {
  const token = req.cookies.token
  console.log(token)
 if (!token) {
    return res.status(401).json({ msg: 'Token ausente' });
  }
const verify = jwt.verify(token,process.env.SECRET_KEY)
if(!verify){
  return res.status(401).json({msg:'Faça login novamente!'})
}

return res.status(200).json({msg:'Acesso liberado!',nome:verify.nome,email:verify.email,tipo:verify.tipo} )

})

//Rota para mudança de senha

router.post('/changepassword',async (req,res)=>{
const db = await connectToDatabase();
const email = req.body.email

  const verify = await db.collection('usuarios').findOne({email:email})

  if(!verify){ 
    return res.status(400).json({msg:'Usuário não existe no banco!'})
  }else{
   const token = jwt.sign({ email:email },process.env.SECRET_KEY,{expiresIn: '1h'})
   const resetLink = `${process.env.LINK_FRONT}/resetpassword/${token}`;
   const htmlContent = fs.readFileSync("src/resetpassword.html", "utf-8").replace('{{resetLink}}', resetLink);
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
  subject: "Alteração de senha",
  html:htmlContent,
  text: `Altere sua senha por esse link: ${process.env.LINK_FRONT}/resetpassword?token=${token}`
};

transporter.sendMail(mailOptions, (erro, info) => {
  if (erro) {
    return res.status(400).json({msg:erro})
  } else {
    return res.status(200).json({msg:"Email enviado com sucesso!" })
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

}

})

router.post('/resetpassword',async (req,res)=>{
  const senha = req.body.senha
  const token = req.body.token
    if(!senha)return res.status(400).json({msg:'Digite a senha!'}) 
    if(!token) return  res.status(400).json({msg:'Sem token de acesso!'})

try {
     const db =   await connectToDatabase()
    const verify = jwt.verify(token,process.env.SECRET_KEY)
    const email = verify.email
    if(!email) {
      return  res.status(400).json({msg:'Token inválido'})}
    else{
      const senhacod = await bcrypt.hash(senha,10)
      const user = await db.collection('usuarios').updateOne({ email }, { $set: { senha: senhacod } })
      res.status(200).json({msg:'Senha atualizada com sucesso!'})
    }
    
  } catch (error) {
  
    res.status(400).json({msg:error})
  }

})

export default router
