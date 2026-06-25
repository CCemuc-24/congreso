'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Menu, X } from 'lucide-react';
import logo from '@/components/images/Logo BW.png';
import sections from '@/utils/sections.json';

const Header: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="flex items-center gap-3">
          <Image src={logo} alt="CCEM UC" width={48} height={48} className="h-10 w-10 invert" />
          <span className="flex flex-col leading-tight">
            <span className="font-display text-xl font-semibold tracking-tight text-primary">
              CCEM UC
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
              CONGRESO DE CIRUGÍA UC PARA ESTUDIANTES DE MEDICINA
            </span>
          </span>
        </Link>

        <ul className="hidden items-center gap-7 lg:flex">
          {sections.sections.map((section, index) => (
            <li key={index}>
              <Link
                href={section.link}
                className="text-sm text-foreground/80 transition-colors hover:text-primary"
              >
                {section.title}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <Link
            href="/pricing"
            className="hidden rounded-lg bg-primary px-5 py-2.5 font-mono text-xs uppercase tracking-[0.1em] text-primary-foreground transition-colors hover:bg-primary-700 sm:inline-block"
          >
            SÉ PARTE DEL CONGRESO
          </Link>
          <button
            type="button"
            aria-label="Abrir menú"
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen((v) => !v)}
            className="inline-flex items-center justify-center rounded-lg p-2 text-foreground hover:bg-muted lg:hidden"
          >
            {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </nav>

      {isMenuOpen && (
        <div className="border-t border-border lg:hidden">
          <ul className="mx-auto flex max-w-7xl flex-col px-6 py-2">
            {sections.sections.map((section, index) => (
              <li key={index}>
                <Link
                  href={section.link}
                  className="block py-2 text-foreground/80 transition-colors hover:text-primary"
                >
                  {section.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  );
};

export default Header;
