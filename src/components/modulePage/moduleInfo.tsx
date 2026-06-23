import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import courseImagesDictionary from '@/components/images/images';

export interface ResponsiveCardProps {
  title: string;
  extraInfo: string;
  imageIndex: number;
  topics: string[];
}

const ResponsiveCard: React.FC<ResponsiveCardProps> = ({ title, extraInfo, imageIndex, topics }) => {
  return (
    <div className="max-w-sm bg-white border-3 border-gray-300 rounded-2xl shadow">
      <div className="overflow-hidden rounded-t-2xl">
        <Image
          src={courseImagesDictionary[imageIndex]}
          alt=""
          className="object-cover w-full h-auto"
          width={500}
          height={500}
        />
      </div>
      <div className="p-5 text-center">
        <h5 className="mb-2 text-2xl sm:text-2xl md:text-3xl font-bold tracking-tight text-black font-lato">
          {title}
        </h5>
        <p className="mb-3 text-xl sm:text-xl md:text-2xl font-bold text-[#116D85] font-open-sans">
          {extraInfo}
        </p>
        <p className="mb-3 text-xl sm:text-xl md:text-xl font-lato font-bold">Temas de las clases</p>

        <ul className="text-left text-base sm:text-base md:text-base font-open-sans list-disc list-inside">
          {topics.map((topic, index) => (
            <li key={index} className="mb-1">
              {topic}
            </li>
          ))}
        </ul>

        <Link
          href="/pricing"
          className="inline-flex items-center px-3 py-2 text-lg font-open-sans font-medium text-center text-white bg-[#116D85] rounded-lg hover:bg-[#0e5b6e] focus:ring-4 focus:outline-none focus:ring-blue-300 dark:bg-[#116D85] dark:hover:bg-[#0e5b6e] dark:focus:ring-blue-800"
        >
          ¿Te gusta? ¡Inscríbete!
          <svg
            className="rtl:rotate-180 w-3.5 h-3.5 ms-2"
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 14 10"
          >
            <path
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M1 5h12m0 0L9 1m4 4L9 9"
            />
          </svg>
        </Link>
      </div>
    </div>
  );
};

export default ResponsiveCard;
