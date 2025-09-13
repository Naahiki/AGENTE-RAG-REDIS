import { retrieveRelevantDocs } from '../packages/retriever/src/index';

const queries = [
  'Bonos Impulsa de internacionalización',
  'Ayudas para proyectos de I+D',
];

const main = async () => {
  for (const query of queries) {
    console.log(`\n🔍 Query: "${query}"`);
    const results = await retrieveRelevantDocs(query, 10);

    if (results.length === 0) {
      console.log('❌ No se encontraron resultados');
      continue;
    }

    results.forEach((doc, i) => {
      console.log(`  📄 ${i + 1}. ${doc.titulo}`);
      console.log(`     Descripcion: ${doc.descripcion}`);

      console.log(`     URL: ${doc.url}`);
      console.log(`     Score: ${doc.score.toFixed(4)}\n`);
    });
  }
};

main().catch((err) => {
  console.error('❌ Error en el test de retriever:', err);
});
