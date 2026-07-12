import generalImage from '@/components/images/cards/general-cirugia-innovacion.png';
import moduloVascular from '@/components/images/cards/modulo-cirugia-vascular.png';
import moduloDigestivaColoproctologia from '@/components/images/cards/modulo-cirugia-digestiva-coloproctologia.png';
import moduloGinecologiaObstetricia from '@/components/images/cards/modulo-ginecologia-obstetricia.png';
import workshopIntubacion from '@/components/images/cards/workshop-intubacion.png';
import workshopTactoRectal from '@/components/images/cards/workshop-tacto-rectal.png';
import workshopExamenGinecologico from '@/components/images/cards/workshop-examen-ginecologico.png';
import workshopRcpAvanzado from '@/components/images/cards/workshop-rcp-avanzado.png';
import workshopSuturas from '@/components/images/cards/workshop-suturas.png';
import workshopAccesosVenosos from '@/components/images/cards/workshop-accesos-venosos.png';
import workshopCuraciones from '@/components/images/cards/workshop-curaciones.png';
import workshopEfast from '@/components/images/cards/workshop-efast.png';
import workshopEcg from '@/components/images/cards/workshop-ecg.png';
import workshopInterpretacionImagenes from '@/components/images/cards/workshop-interpretacion-imagenes.png';
import { StaticImageData } from 'next/image';

// Ordered by specificity: matched against the course title (case-insensitive),
// first keyword to match wins, so more specific keywords must come first
// (e.g. "ginecología y obstetricia" before "ginecológico").
const COURSE_IMAGE_RULES: { keyword: string; image: StaticImageData }[] = [
  { keyword: 'cirugía vascular', image: moduloVascular },
  { keyword: 'digestiva', image: moduloDigestivaColoproctologia },
  { keyword: 'ginecología y obstetricia', image: moduloGinecologiaObstetricia },
  { keyword: 'tacto rectal', image: workshopTactoRectal },
  { keyword: 'examen ginecológico', image: workshopExamenGinecologico },
  { keyword: 'e-fast', image: workshopEfast },
  { keyword: 'ecg', image: workshopEcg },
  { keyword: 'intubación', image: workshopIntubacion },
  { keyword: 'suturas', image: workshopSuturas },
  { keyword: 'rcp avanzado', image: workshopRcpAvanzado },
  { keyword: 'curaciones', image: workshopCuraciones },
  { keyword: 'interpretación de imágenes', image: workshopInterpretacionImagenes },
  { keyword: 'accesos venosos', image: workshopAccesosVenosos },
];

export function getCourseImage(title: string): StaticImageData {
  const normalized = title.toLowerCase();
  const match = COURSE_IMAGE_RULES.find((rule) => normalized.includes(rule.keyword));
  return match ? match.image : generalImage;
}
