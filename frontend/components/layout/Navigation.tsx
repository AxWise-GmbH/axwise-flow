import { Button3D } from './Button3D';
import { Menu } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { useState } from 'react';

export function Navigation() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50">
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="bg-white/60 backdrop-blur-md rounded-full px-6 md:px-8 py-4 flex items-center justify-between shadow-lg border border-gray-100/50 transition-all duration-300 hover:bg-white/80 hover:shadow-xl">
          <a href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 3L16 6.5V13.5L10 17L4 13.5V6.5L10 3Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="10" cy="10" r="1.2" fill="white" />
              </svg>
            </div>
            <span className="text-black tracking-tight font-semibold">AxWise</span>
          </a>

          <div className="hidden md:flex items-center gap-8">
            <a href="/b2b" className="text-gray-600 hover:text-black transition-colors text-sm font-medium">Enterprise</a>
            <a href="/#features" className="text-gray-600 hover:text-black transition-colors text-sm font-medium">Features</a>
            <a href="/#benefits" className="text-gray-600 hover:text-black transition-colors text-sm font-medium">Benefits</a>
            <a href="mailto:support@axwise.de" className="text-gray-600 hover:text-black transition-colors text-sm font-medium">Contact</a>
            <a href="https://api.axwise.de/redoc" target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-black transition-colors text-sm font-medium">Docs &amp; SDK</a>
          </div>


          <div className="hidden md:flex items-center gap-3">
            <Button3D size="sm" variant="secondary" href="https://tidycal.com/team/axwise/demo">Book a Demo</Button3D>
            <Button3D size="sm" href="/unified-dashboard">Get Started</Button3D>
          </div>

          <div className="md:hidden">
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger asChild>
                <button className="p-2 -mr-2 text-gray-600 hover:text-black">
                  <Menu className="w-6 h-6" />
                </button>
              </SheetTrigger>
              <SheetContent>
                <SheetTitle className="sr-only">Mobile Menu</SheetTitle>
                <div className="flex flex-col gap-6 mt-8">
                  <a href="/b2b" onClick={() => setIsOpen(false)} className="text-lg font-medium text-gray-900">Enterprise</a>
                  <a href="/#features" onClick={() => setIsOpen(false)} className="text-lg font-medium text-gray-900">Features</a>
                  <a href="/#benefits" onClick={() => setIsOpen(false)} className="text-lg font-medium text-gray-900">Benefits</a>
                  <a href="mailto:support@axwise.de" onClick={() => setIsOpen(false)} className="text-lg font-medium text-gray-900">Contact</a>
                  <a href="https://api.axwise.de/redoc" target="_blank" rel="noopener noreferrer" onClick={() => setIsOpen(false)} className="text-lg font-medium text-gray-900">Docs &amp; SDK</a>
                  <div className="pt-4 flex flex-col gap-3">
                    <Button3D size="md" variant="secondary" href="https://tidycal.com/team/axwise/demo">Book a Demo</Button3D>
                    <Button3D size="md" href="/unified-dashboard">Get Started</Button3D>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </nav>
  );
}