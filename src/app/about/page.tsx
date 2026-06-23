import React from 'react';
import Header from '@/components/header';
import InfoCard from '@/components/InfoCard';

const AboutPage: React.FC = () => {
  return (
    <div>
      <Header />
      <main className="max-w-8xl mx-auto p-6 font-open-sans">
        <div className="flex justify-center mb-4">
          <h2 className="text-3xl font-bold text-[#00778B]">COMPETENCIA CIENTÍFICA</h2>
        </div>
        <div className="flex justify-center mb-6">
          <hr className="w-full border-t-2 border-gray-300" />
        </div>

        <div className="text-lg text-gray-800">
          <p>¡Bienvenidos al Congreso de Cirugía para Estudiantes de Medicina! Este importante evento académico y científico tiene como objetivo principal facilitar un intercambio enriquecedor de conocimientos y experiencias clínicas entre los participantes. Para ello, contará con las siguientes categorías, pudiendo ser para trabajos de investigación o casos clínicos:</p>
          <ul className="list-disc ml-6 my-4">
            <li>Cirugía general y sus subespecialidades.</li>
            <li>Traumatología y ortopedia.</li>
            <li>Neurocirugía.</li>
            <li>Ginecología y obstetricia.</li>
            <li>Urología.</li>
            <li>Anestesiología y reanimación.</li>
          </ul>
          <p>La competencia no solo ofrece un espacio para que los estudiantes presenten y discutan sus hallazgos con médicos especialistas y colegas, sino que también promueve la investigación y la innovación en el campo médico. Este congreso es más que una reunión académica; es una oportunidad para que las jóvenes mentes médicas exploren nuevas ideas, mejoren sus habilidades investigativas y establezcan valiosas conexiones profesionales.</p>
          <p>En nombre del comité organizador, agradecemos sinceramente la participación y entusiasmo de todos los asistentes. Esperamos que este congreso sea un espacio fructífero y gratificante, lleno de descubrimientos significativos y colaboraciones prometedoras que contribuyan al avance continuo de la práctica médica.</p>
        </div>

        <div className="flex justify-center mb-8"></div>
        <div className="flex justify-center mb-4">
          <h2 className="text-3xl font-bold text-[#00778B]">FECHAS IMPORTANTES</h2>
        </div>
        <div className="flex justify-center mb-6">
          <hr className="w-full border-t-2 border-gray-300" />
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse border border-gray-300 mt-6">
            <thead>
              <tr>
                <th className="border border-gray-300 p-2 text-left">Evento</th>
                <th className="border border-gray-300 p-2 text-left">Fecha</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-300 p-2">Publicación de bases:</td>
                <td className="border border-gray-300 p-2">Lunes 22 de Julio</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2">Período de recepción de trabajos:</td>
                <td className="border border-gray-300 p-2">Jueves 1 de Agosto a Sábado 10 de Agosto o hasta alcanzar la cantidad de 100 trabajos</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2">Revisión y selección de trabajos:</td>
                <td className="border border-gray-300 p-2">Lunes 12 a Viernes 23 de Agosto</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2">Publicación trabajos seleccionados:</td>
                <td className="border border-gray-300 p-2">Lunes 26 de Agosto</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2">Período de apelación:</td>
                <td className="border border-gray-300 p-2">Miércoles 28 de Agosto a Viernes 30 de Agosto (a las 23:59 hrs)</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2">Fecha de presentación de trabajos (pósters):</td>
                <td className="border border-gray-300 p-2">Viernes 13 de Septiembre</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2">Envío de certificados de participación:</td>
                <td className="border border-gray-300 p-2">Viernes 20 de Septiembre</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2">Publicación libro resumen:</td>
                <td className="border border-gray-300 p-2">Viernes 20 de Septiembre</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2">Período de solicitud de correcciones de certificados y libro resumen:</td>
                <td className="border border-gray-300 p-2">5 días hábiles desde la fecha de emisión</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flex justify-center mb-6"></div>
        <p>*El comité organizador se reserva el derecho a establecer fechas suplementarias para recepción y revisión de trabajos, las cuales serán debidamente informadas a los participantes</p>

        <div className="flex justify-center mb-8"></div>
        <div className="flex justify-center mb-4">
          <h2 className="text-3xl font-bold text-[#00778B]">DOCUMENTOS</h2>
        </div>
        <div className="flex justify-center mb-6">
          <hr className="w-full border-t-2 border-gray-300" />
        </div>

        <div className="px-8 sm:px-8 lg:px-8">
          <div className="max-w-7xl mx-auto grid gap-8 grid-cols-1 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3">
            <InfoCard text="Bases Competencia Científica" />
            <InfoCard text="Trabajos aceptados" />
            <InfoCard text="Distribución de Paneles" />
          </div>
        </div>
      </main>
    </div>
  );
};

export default AboutPage;
