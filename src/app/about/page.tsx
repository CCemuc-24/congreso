import React from 'react';
import Header from '@/components/header';
import InfoCard from '@/components/InfoCard';
import { SectionHeading } from '@/components/luz/SectionHeading';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const importantDates: [string, string][] = [
  ['Período de recepción de trabajos:', '11/07/2026 al 11/08/2026'],
  ['Publicación de trabajos seleccionados:', '09/09/2026'],
  ['Presentación de trabajos:', '03/10/2026'],
  ['Presentación de finalistas:', '24/10/2026'],
];

const AboutPage: React.FC = () => {
  return (
    <div>
      <Header />
      <main className="mx-auto max-w-4xl px-6 py-16">
        <SectionHeading eyebrow="Presenta tu trabajo" title="Competencia científica" align="left" />
        <div className="space-y-4 text-lg leading-relaxed text-muted-foreground">
          <p>¡Bienvenidos al Congreso de Cirugía para Estudiantes de Medicina! Este importante evento académico y científico tiene como objetivo principal facilitar un intercambio enriquecedor de conocimientos y experiencias clínicas entre los participantes. Para ello, contará con las siguientes categorías, pudiendo ser para trabajos de investigación o casos clínicos:</p>
          <ul className="ml-6 list-disc space-y-1">
            <li>Cirugía general y sus subespecialidades.</li>
            <li>Cirugía pediátrica.</li>
            <li>Traumatología y ortopedia.</li>
            <li>Neurocirugía.</li>
            <li>Ginecología y obstetricia.</li>
            <li>Urología.</li>
            <li>Anestesiología y reanimación.</li>
            <li>Otorrinolaringología.</li>
            <li>Dermatología.</li>
            <li>Oftalmología.</li>
          </ul>
          <p>La competencia no solo ofrece un espacio para que los estudiantes presenten y discutan sus hallazgos con médicos especialistas y colegas, sino que también promueve la investigación y la innovación en el campo médico. Este congreso es más que una reunión académica; es una oportunidad para que las jóvenes mentes médicas exploren nuevas ideas, mejoren sus habilidades investigativas y establezcan valiosas conexiones profesionales.</p>
          <p>En nombre del comité organizador, agradecemos sinceramente la participación y entusiasmo de todos los asistentes. Esperamos que este congreso sea un espacio fructífero y gratificante, lleno de descubrimientos significativos y colaboraciones prometedoras que contribuyan al avance continuo de la práctica médica.</p>
        </div>

        <div className="mt-16">
          <SectionHeading eyebrow="Agenda" title="Fechas importantes" align="left" />
          <div className="overflow-hidden rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Evento</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importantDates.map(([evento, fecha], i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium text-foreground">{evento}</TableCell>
                    <TableCell className="text-muted-foreground">{fecha}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            *El comité organizador se reserva el derecho a establecer fechas suplementarias para recepción y revisión de trabajos, las cuales serán debidamente informadas a los participantes
          </p>
        </div>

        <div className="mt-16">
          <SectionHeading eyebrow="Para descargar" title="Documentos" align="left" />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
