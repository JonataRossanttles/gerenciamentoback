import express from "express"
import connectToDatabase from "../config/db.js"
import bcrypt from "bcrypt"
import dotenv from 'dotenv';
import jwt from "jsonwebtoken"
import nodemailer from "nodemailer" // Enviar email
import fs from 'fs' // Gestão de arquivos - nativo do node.js
import generator from "generate-password" // gerar senha aleatória
import { ObjectId } from "mongodb";
import { MongoClient } from "mongodb"
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
   
    if(!resposta) return res.status(400).json({ msg: "Usuário não cadastrado!" });

    const verify = await bcrypt.compare(senha, resposta.senha);

  if (verify == true){
    const token = jwt.sign({nome:resposta.nome,email:resposta.email,escolaId:resposta.escolaId ,tipo:resposta.tipo,userId:resposta.userId},
      process.env.SECRET_KEY,{expiresIn: '1h'})
    return res.status(200).cookie('token',token,{httpOnly: true,maxAge: 3600000,sameSite:'none', secure: true }).json({ nome:resposta.nome , tipo:resposta.tipo }) // 1 HORA
     //trocar por sameSite:none e secure:true quando for para produção com HTTPS
     //trocar por sameSite:lax e secure:false quando for para produção com HTTP
  } else{
    return res.status(400).json({msg:"Senha incorreta!"})
  } 
   
})

router.get('/logout',async (req, res) => {
    const db =   await connectToDatabase();
  try {
     res.clearCookie("token", {
    httpOnly: true,
    secure: false,   // true se estiver em HTTPS
    sameSite: "lax"
  });
  return res.status(200).json({ msg: "Logout realizado com sucesso!" });
    
  } catch (error) {
    return res.status(500).json({ msg: "Erro ao realizar logout!" });
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
  if (!turmaId || alunosId.length === 0){
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
  const {turmaorigemId,turmadestinoId,alunosId} = req.body.dados

    const token = req.cookies.token
 if (!token) {
    return res.status(401).json({ msg: 'Token ausente' });
  }
const verify = jwt.verify(token,process.env.SECRET_KEY)
if(!verify){
  return res.status(401).json({msg:'Faça login novamente!'})
}
  if (!turmaorigemId || !turmadestinoId || alunosId.length === 0){
    return res.status(400).json({msg:'Preencha os campos obrigatórios!'})
  }
  if(turmaorigemId === turmadestinoId){
return res.status(400).json({msg:'As turmas de origem e destino não podem ser iguais!'})
  }

  try {
    const TurmaorigemObjId = new ObjectId(turmaorigemId) 
    const TurmadestinoObjId = new ObjectId(turmadestinoId) 
    const AlunosObjId = alunosId.map(id => new ObjectId(id))

  const up_alunos_turmadestino = await db.collection('alunos').updateMany({ _id: { $in: AlunosObjId } },
  { $set: { turmaId: TurmadestinoObjId } })

  const up_turmaantiga =  await db.collection('turmas').updateOne({_id:TurmaorigemObjId},{$pull:{alunos:{$in:AlunosObjId}}});

 const up_novaturma = await db.collection('turmas').updateOne({_id:TurmadestinoObjId},{$addToSet:{alunos:{$each:AlunosObjId}}})

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
  if (!turmaId || disciplinasId.length === 0){
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
  const {turmaorigemId,turmadestinoId,disciplinasId} = req.body.dados

    const token = req.cookies.token
 if (!token) {
    return res.status(401).json({ msg: 'Token ausente' });
  }
const verify = jwt.verify(token,process.env.SECRET_KEY)
if(!verify){
  return res.status(401).json({msg:'Faça login novamente!'})
}
  if (!turmaorigemId || !turmadestinoId || disciplinasId.length === 0){
    return res.status(400).json({msg:'Preencha os campos obrigatórios!'})
  }
  if(turmaorigemId === turmadestinoId){
return res.status(400).json({msg:'As turmas de origem e destino não podem ser iguais!'})
  }

  try {
    const TurmaorigemObjId = new ObjectId(turmaorigemId) 
    const TurmadestinoObjId = new ObjectId(turmadestinoId) 
    const DisciplinasObjId = disciplinasId.map(id => new ObjectId(id))
    const anoLetivo = new Date().getFullYear()

    await Promise.all([
         db.collection('disciplinas').updateMany({ _id: { $in: DisciplinasObjId } },
      { $set: { turmaId: TurmadestinoObjId } }),

      db.collection('turmas').updateOne({_id:TurmaorigemObjId},{$pull:{disciplinas:{$in:DisciplinasObjId}}}),

      db.collection('turmas').updateOne({_id:TurmadestinoObjId},{$addToSet:{disciplinas:{$each:DisciplinasObjId}}}),
      db.collection('profxturmasxdisciplinas').updateMany({turmaId:TurmaorigemObjId , disciplinaId:{$in:DisciplinasObjId}, anoLetivo:anoLetivo },{$set:{status:false}}),
      db.collection('profxturmasxdisciplinas').updateMany({turmaId:TurmadestinoObjId , disciplinaId:{$in:DisciplinasObjId}, anoLetivo:anoLetivo },{$set:{status:true}})
     
    ])


  return res.status(200).json({msg:'Disciplinas alteradas para a nova turma com sucesso!'})
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
  const {turmaorigemId,turmadestinoId,professoresId} = req.body.dados
  const token = req.cookies.token
    if (!token) {
        return res.status(401).json({ msg: 'Token ausente' });
      }
    const verify = jwt.verify(token,process.env.SECRET_KEY)
    if(!verify){
      return res.status(401).json({msg:'Faça login novamente!'})
    }


  if (!turmaorigemId || !turmadestinoId || professoresId.length === 0){
    return res.status(400).json({msg:'Preencha os campos obrigatórios!'})

  }
  if(turmaorigemId === turmadestinoId){
     return res.status(400).json({msg:'As turmas de origem e destino não podem ser iguais!'})
  }

  try {

    const TurmaorigemObjId = new ObjectId(turmaorigemId) 
    const TurmadestinoObjId = new ObjectId(turmadestinoId) 
    const ProfessoresObjId = professoresId.map(id => new ObjectId(id))
    const anoLetivo = new Date().getFullYear()
    await Promise.all([ 
      db.collection('usuarios').updateMany({ _id: { $in: ProfessoresObjId } },
  { $addToSet: { turmas: TurmadestinoObjId } }),

   db.collection('usuarios').updateMany({ _id: { $in: ProfessoresObjId } },
  { $pull: { turmas: TurmaorigemObjId } }),

   db.collection('turmas').updateOne({_id:TurmaorigemObjId},{$pull:{professores:{$in:ProfessoresObjId}}}),

   db.collection('turmas').updateOne({_id:TurmadestinoObjId},{$addToSet:{professores:{$each:ProfessoresObjId}}}),

    db.collection('profxturmasxdisciplinas').updateMany({turmaId:TurmaorigemObjId , professoresId:{$in:ProfessoresObjId}, anoLetivo:anoLetivo },{$pull:{professoresId:{$in:ProfessoresObjId}}})
   ])

  return res.status(200).json({msg:'Professores alterados para nova turma com sucesso!'})
  } catch (error) {
    return res.status(400).json({msg:error.message})
  }
 
})
router.post('/turma/disciplina/professores',async (req,res)=>{
  const db = await connectToDatabase()
  const {turmaId,disciplinaId,professoresId,anoLetivo} = req.body.dados

   const token = req.cookies.token
   if (!token) {
    return res.status(401).json({ msg: 'Token ausente' });
  }
    try {
        const verify = jwt.verify(token,process.env.SECRET_KEY)
        if(!verify){
          return res.status(401).json({msg:'Faça login novamente!'})
        }
        if (!turmaId || !disciplinaId || !professoresId || professoresId.length===0 || !anoLetivo)  return res.status(400).json({msg:'Preencha todos os campos!'})
        const turmaIdobj = new ObjectId(turmaId)
        const disciplinaIdobj = new ObjectId(disciplinaId)
        const professoresIdobj = professoresId.map(id => new ObjectId(id))
        const anoLetivoobj = Number(anoLetivo)
const resultado =  await  Promise.all([
    // Adiciona a turma no professor e o professor na turma
     db.collection('turmas').updateOne({_id:turmaIdobj},{$addToSet:{professores:{$each:professoresIdobj}}}),
     db.collection('usuarios').updateMany(
    { _id: { $in: professoresIdobj } },
    { $addToSet: { turmas: turmaIdobj } }
  ),
  // Adiciona na relação de profesor x Disciplina x Turma
   db.collection("profxturmasxdisciplinas").updateOne(
  { turmaId: turmaIdobj, disciplinaId: disciplinaIdobj },
  { $addToSet: { professoresId:{$each: professoresIdobj}, anoLetivo: anoLetivoobj, status:true } },
  { upsert: true }
),
// Adiciona a disciplina no professor e o professor na disciplina
 db.collection('disciplinas').updateOne({_id:disciplinaIdobj},{$addToSet:{professores:{$each:professoresIdobj}}}),
 db.collection('usuarios').updateMany(
  {_id:{$in: professoresIdobj}},
  {$addToSet:{disciplinas:disciplinaIdobj}}
)
  ])
  
      return res.status(200).json({msg:"Professores adicionados com sucesso!"})
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
const userIdobj = new ObjectId(verify.userId)
if(!verify){
  return res.status(401).json({msg:'Faça login novamente!'})
}
if(!anoLetivo) return res.status(400).json({msg:'Preencha o campo obrigatório!'})
    try {
      if(verify.tipo == 'admin'){
            if(anoLetivo == "todos"){
          const consultarturmas = await db.collection("turmas").find({projection:{alunos:0,professores:0,disciplinas:0,_id:0}}).toArray()
          return res.status(200).json({msg:consultarturmas})
        }
      const consultarturmas = await db.collection("turmas").find({anoLetivo:Number(anoLetivo)},{projection:{alunos:0,professores:0,disciplinas:0,_id:0}}).toArray()
      return res.status(200).json({msg:consultarturmas})
    } else{
      console.log('erro?')
        if(anoLetivo == "todos"){
          const consultarturmas = await db.collection("turmas").find({professores:userIdobj},{projection:{alunos:0,professores:0,disciplinas:0,_id:0}}).toArray()
          return res.status(200).json({msg:consultarturmas})
        }
      const consultarturmas = await db.collection("turmas").find({professores:userIdobj},{anoLetivo:Number(anoLetivo)},{projection:{alunos:0,professores:0,disciplinas:0,_id:0}}).toArray()
      return res.status(200).json({msg:consultarturmas})

    } 

      }
        
        catch (error) {
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
const userIdobj = new ObjectId(verify.userId)

if(!verify){
  return res.status(401).json({msg:'Faça login novamente!'})
}
if(!anoLetivo) return res.status(400).json({msg:'Preencha o campo obrigatório!'})

    try {
       if(verify.tipo === 'admin'){
            const consultardisc = await db.collection("disciplinas").find({anoLetivo:anoLetivo},{projection:{professores:0,turmas:0,escolaId:0,_id:0}}).toArray()
            return res.status(200).json({msg:consultardisc})
       } else{
           const consultardisc = await db.collection("disciplinas").find({anoLetivo:anoLetivo, professores:userIdobj},{projection:{professores:0,turmas:0,escolaId:0,_id:0}}).toArray()
            return res.status(200).json({msg:consultardisc})
       }

       
      
    } catch (error) {
       return res.status(400).json({msg:error.message})
    }

})
router.get('/consultar/professores',async (req,res)=>{
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
      const consultarprof = await db.collection("usuarios").find({tipo:"prof",status:true},{projection:{senha:0}}).toArray()
      return res.status(200).json({msg:consultarprof})
    } catch (error) {
       return res.status(400).json({msg:error.message})
    }

})
router.post('/consultar/professor/turmas/disciplinas',async (req,res)=>{
  const db = await connectToDatabase()
  const {userId,anoLetivo,turmaId} = req.body.dados
   const token = req.cookies.token

   if (!token) {
    return res.status(401).json({ msg: 'Token ausente' });
  }
    try {
        const verify = jwt.verify(token,process.env.SECRET_KEY)
        if(!verify){
          return res.status(401).json({msg:'Faça login novamente!'})
        }
        const userIdobj = new ObjectId(userId)
        const anoLetivobj = Number(anoLetivo)
        const turmaIdobj = new ObjectId(turmaId)
        
        const consultardisc = await db.collection("profxturmasxdisciplinas").aggregate([
        { 
          $match: { professoresId:userIdobj,anoLetivo:anoLetivobj,turmaId:turmaIdobj,status:true }
        },
        {
          $lookup:{
            from:"disciplinas",
            localField:"disciplinaId",
            foreignField: "_id",
            pipeline:[
              {
                $project:{
                  descricao:0,
                  cargaHoraria:0,
                  _id:0,
                  professores:0,
                  escolaId:0,
                  turmas:0
                }
              }
            ],
            as: "dadosdisciplinas" 
          }},{
        $project: {
      // Campos da coleção profxturmasxdisciplinas que você quer esconder:
      anoLetivo: 0,
      turmaId: 0,
      disciplinaId:0,
      _id:0
    }
  }
      ]).toArray()
     
      return res.status(200).json({msg:consultardisc})
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

  
    try {

if(!verify){
  return res.status(401).json({msg:'Faça login novamente!'})
}

if(!situacao || typeof situacao !== 'string') return res.status(400).json({msg:'Preencha o campo obrigatório!'})
const matchStage = situacao === "TODOS" ? {} : { situacao }    

        const consultaralunos = await db.collection("alunos").aggregate([
        { 
          $match: {matchStage} // Documento dentro de turmas
        },
        {
          $lookup:{
            localField:"turmaId", // Campo do documento da coleção alunos
            from:"turmas", // Coleção onde eu vou buscar a informação
            foreignField: "_id", // Campo da coleção alunos que vou comparar com o campo alunos da coleção turmas.
            pipeline: [
        { $project: {  // Corresponde a coleção em que eu estou buscando os dados
          
          turma: 1
        } 
        }
      ],
            as: "dadosturma" 
          }

        }
          
      ]).toArray()
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
  const {turmaId,anoLetivo} = req.body.dados


  const token = req.cookies.token
 if (!token) {
    return res.status(401).json({ msg: 'Token ausente' });
  }
const verify = jwt.verify(token,process.env.SECRET_KEY)
console.log(verify.userId)
console.log(req.body.dados)
if(!verify){
  return res.status(401).json({msg:'Faça login novamente!'})
}

  const TurmaobjId = new ObjectId(turmaId)
  const anoLetivoNum = Number(anoLetivo)
  const userIdobj = new ObjectId(verify.userId)
console.log(anoLetivoNum)
  if(!turmaId) return res.status(400).json({msg:'Preencha o campo obrigatório!'})

    try {
      if(verify.tipo === 'admin'){
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
      }else{
        const consultardisc = await db.collection("profxturmasxdisciplinas").aggregate([
        { 
          $match: {professoresId:userIdobj,anoLetivo:anoLetivoNum,turmaId:TurmaobjId}
        },
        {
          $lookup:{
            from:"disciplinas",
            localField:"disciplinaId",
            foreignField: "_id",
            pipeline:[
              {
                $project:{                  
                  _id:0,
                  professores:0,
                  escolaId:0,
                  turmas:0
                }
              }
            ],
            as: "dadosdisciplinas" 
          }},{
        $project: {
      // Campos da coleção profxturmasxdisciplinas que você quer esconder:
      anoLetivo: 0,
      turmaId: 0,
      disciplinaId:0,
      _id:0
    }
  }
      ]).toArray()

       return res.status(200).json({msg:consultardisc})
      }

     
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
                $match: {tipo: "prof"} // só pega usuários do tipo prof
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

router.get('/consultar/dadosbanco',async (req,res)=>{
  
   const token = req.cookies.token
 if (!token) {
    return res.status(401).json({ msg: 'Token ausente' });
  }
const verify = jwt.verify(token,process.env.SECRET_KEY)
if(!verify){
  return res.status(401).json({msg:'Faça login novamente!'})
}
async function getDbUsage() {
  const uri = process.env.MONGO_URL; // ou sua connection string Atlas
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db("gerenciamento");

    const stats = await db.stats();

    return {
      dataSizeMB: stats.dataSize / 1024 / 1024,
      storageSizeMB: stats.storageSize / 1024 / 1024
    };
  } finally {
    await client.close();
  }
}
const {dataSizeMB, storageSizeMB} = await getDbUsage()
return res.status(200).json({msg:{dataSizeMB,storageSizeMB}})

})

//Criar rotas para Frequências

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
        
if(turmaId.length === 0){
  return res.status(400).json({msg:'Preencha os campos obrigatórios!'})
}

      const turmaIdobj =  turmaId.map((element)=> new ObjectId(element))
  await Promise.all([
      db.collection("turmas").deleteMany({_id: { $in: turmaIdobj }}),
      db.collection("alunos").updateMany({turmaId: { $in: turmaIdobj }},{$set:{turmaId: null}}),
      db.collection("usuarios").updateMany({turmas: { $in: turmaIdobj }, tipo: 'prof'},{$pull:{turmas: turmaIdobj}}),
      db.collection("profxturmasxdisciplinas").deleteMany({turmaId: { $in: turmaIdobj }})
  ])
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

if(alunosId.length == 0){
  return res.status(400).json({msg:'Preencha os campos obrigatórios!'})
}

      const alunosIdobj = alunosId.map((element)=> new ObjectId(element))
     await Promise.all([
       db.collection("alunos").deleteMany({_id: { $in: alunosIdobj }}),
       db.collection("turmas").updateMany({alunos: { $in:alunosIdobj } },{$pull:{alunos:{$in:alunosIdobj}}})
     ])
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
  const {professoresId,turmaId,periodoLetivo} = req.body.dados

  const token = req.cookies.token
 if (!token) {
    return res.status(401).json({ msg: 'Token ausente' });
  }
const verify = jwt.verify(token,process.env.SECRET_KEY)
if(!verify){
  return res.status(401).json({msg:'Faça login novamente!'})
}
  
    try {
      

if(!professoresId || professoresId.length === 0 || !turmaId || !periodoLetivo){
  return res.status(400).json({msg:'Preencha os campos obrigatórios!'})
}

      const professoresIdobj = professoresId.map(id => new ObjectId(id))
      const turmaIdobj = new ObjectId(turmaId)
      const periodoLetivobj = Number(periodoLetivo)
      await Promise.all([
        // Retira os professores das turmas
        db.collection("turmas").updateOne({_id:turmaIdobj},{ $pullAll: { professores: professoresIdobj } }),
        // Retira as turmas dos professores
        db.collection("usuarios").updateMany({_id: { $in: professoresIdobj }},{ $pull: { turmas:  turmaIdobj } }),
        // Retira o professor da relação tumaxprofessorxdisciplina
        db.collection("profxturmasxdisciplinas").updateMany(
        { turmaId: turmaIdobj, anoLetivo: periodoLetivobj },
        { $pull: { professoresId: { $in: professoresIdobj } } })
        ])
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

if(!discId || discId.length === 0){
  return res.status(400).json({msg:'Preencha os campos obrigatórios!'})
}

      const discIdobj = discId.map(id => new ObjectId(id))

      await Promise.all([
        db.collection("disciplinas").deleteMany({_id:{$in:discIdobj}}),
        db.collection("turmas").updateMany({disciplinas: {$in:discIdobj}},{$pull : {disciplinas:{$in:discIdobj}}}),
        db.collection("profxturmasxdisciplinas").deleteMany({disciplinaId: { $in: discIdobj }}, {$set:{disciplinaId:null}})
      ])
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



