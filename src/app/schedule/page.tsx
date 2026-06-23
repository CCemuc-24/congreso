import React from 'react';
import Header from '@/components/header';
import InfoCard from '@/components/InfoCard';

const SchedulePage = () => {
  return (
    <div>
      <Header />
      <div className="max-w-8xl mx-auto p-6">
        <div className="flex justify-center mb-4">
          <h2 className="text-3xl font-bold text-[#00778B]">CRONOGRAMAS</h2>
        </div>
        <div className="flex justify-center mb-6">
          <hr className="w-full border-t-2 border-gray-300" />
        </div>
      </div>

      <div className="px-8 sm:px-8 lg:px-8">
        <div className="max-w-7xl mx-auto grid gap-8 grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
          <InfoCard text="Sábado 31/08" />
          <InfoCard text="Sábado 07/09" />
          <InfoCard text="Sábado 14/09" />
          <InfoCard text="Semana 1" />
          <InfoCard text="Semana 2" />
          <InfoCard text="Semana 3" />
        </div>
      </div>
    </div>
  );
};

export default SchedulePage;
