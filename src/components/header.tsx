'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import logo from '@/components/images/Logo BW.png';
import { League_Spartan } from 'next/font/google';

import sections from '@/utils/sections.json';

const leagueSpartan = League_Spartan({ subsets: ['latin'] });

const Header: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <header>
      <nav className="bg-black border-gray-200 px-4 lg:px-6 py-5">
        <div className="flex flex-wrap justify-between items-center mx-auto max-w-screen-xl w-full py-2">
          <Link href="/" className="flex items-center">
            <div className="flex items-center">
              <Image
                src={logo}
                alt="logo"
                width={180}
                height={180}
                className="mr-3 h-12 w-12 md:h-24 md:w-24 lg:h-36 lg:w-36"
              />
            </div>
            <div className="flex flex-col ml-3">
              <span
                className={`text-2xl md:text-4xl lg:text-6xl xl:text-[80px] font-semibold whitespace-nowrap text-white ${leagueSpartan.className}`}
              >
                CCEM UC
              </span>
              <span className="text-xs md:text-sm lg:text-base xl:text-[12px] text-white">
                CONGRESO DE CIRUGÍA UC PARA ESTUDIANTES DE MEDICINA
              </span>
            </div>
          </Link>
          <div className="flex justify-center w-full lg:w-auto mt-4 lg:mt-0">
            <Link
              href="/pricing"
              className={`text-white bg-[#116D85] hover:bg-[#0E5A6E] focus:ring-4 focus:ring-gray-300 font-medium rounded-lg text-sm md:text-base lg:text-lg px-4 lg:px-5 py-2 lg:py-2.5 mr-2 focus:outline-none dark:focus:ring-gray-800 ${leagueSpartan.className}`}
            >
              SÉ PARTE DEL CONGRESO
            </Link>
          </div>
        </div>

        <div className="bg-black border-gray-200 items-center mx-auto max-w-screen-xl w-full flex flex-col justify-center">
          <div className="flex items-center lg:order-2">
            <button
              onClick={toggleMenu}
              type="button"
              className="inline-flex items-center p-2 ml-1 text-sm text-white rounded-lg lg:hidden hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-200"
              aria-controls="mobile-menu-2"
              aria-expanded={isMenuOpen ? 'true' : 'false'}
            >
              <svg
                className={`w-6 h-6 ${isMenuOpen ? 'hidden' : 'block'}`}
                fill="currentColor"
                viewBox="0 0 20 20"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fillRule="evenodd"
                  d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                  clipRule="evenodd"
                ></path>
              </svg>
              <svg
                className={`w-6 h-6 ${isMenuOpen ? 'block' : 'hidden'}`}
                fill="currentColor"
                viewBox="0 0 20 20"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                ></path>
              </svg>
            </button>
          </div>
          <div
            className={`${isMenuOpen ? 'block' : 'hidden'} justify-between items-center w-full lg:flex lg:w-auto lg:order-1`}
            id="mobile-menu-2"
          >
            <ul className="flex flex-col mt-4 font-medium lg:flex-row lg:space-x-8 lg:mt-0">
              {sections.sections.map((section, index) => (
                <li key={index}>
                  <Link
                    href={section.link}
                    className="block py-2 pr-4 pl-3 text-white border-b border-gray-100 hover:bg-gray-500 lg:hover:bg-transparent lg:border-0 lg:p-0 dark:text-white dark:hover:bg-gray-700 dark:hover:text-gray-400 lg:dark:hover:bg-transparent dark:border-gray-700 cursor-pointer"
                    style={{ fontSize: '20px' }}
                  >
                    {section.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </nav>
    </header>
  );
};

export default Header;
