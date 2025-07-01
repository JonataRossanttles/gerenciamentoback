import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

const client = new MongoClient(process.env.MONGO_LOCAL);

export default async function connectToDatabase() {
  try {
    await client.connect();
    console.log('🟢 Conectado ao MongoDB');
    return client.db("gerenciamento"); // retorna o banco padrão da string
  } catch (error) {
    console.error('🔴 Erro ao conectar ao MongoDB:', error);
    process.exit(1); // encerra a aplicação se falhar
  }
}

