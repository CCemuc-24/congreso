import React from 'react';
import Header from '@/components/header';

const Contact: React.FC = () => {
  return (
    <div>
      <Header />
      <div className="max-w-8xl mx-auto p-6">
        <div className="flex justify-center mb-4">
          <h2 className="text-3xl font-bold text-[#00778B]">CONTACTO</h2>
        </div>
        <div className="flex justify-center mb-6">
          <hr className="w-full border-t-2 border-gray-300" />
        </div>
        <div className="flex flex-col items-center space-y-4">
          <a href="mailto:contacto@ccemuc.cl" className="text-lg text-blue-600 hover:underline">
            contacto@ccemuc.cl
          </a>
          <a
            href="https://www.instagram.com/ccem.uc"
            target="_blank"
            rel="noopener noreferrer"
            className="text-lg text-blue-600 hover:underline"
          >
            Instagram: ccem.uc
          </a>
        </div>
      </div>
    </div>
  );
};

export default Contact;
