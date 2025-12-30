import Image from "next/image";

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white p-8">
      <header className="flex justify-between items-center py-6 mb-12 border-b border-zinc-800">
        <h1 className="text-3xl font-bold tracking-tighter">ooo shop</h1>
        <nav className="space-x-6 text-sm font-medium text-zinc-400">
          <a href="#" className="hover:text-white transition-colors">Products</a>
          <a href="#" className="hover:text-white transition-colors">Collections</a>
          <a href="#" className="hover:text-white transition-colors">About</a>
        </nav>
      </header>

      <main>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[1, 2, 3].map((item) => (
            <div key={item} className="group relative aspect-square bg-zinc-900 rounded-lg overflow-hidden border border-zinc-800 hover:border-zinc-700 transition-all">
              <div className="absolute inset-0 flex items-center justify-center text-zinc-700 font-mono">
                Product {item}
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="font-medium text-white">New Arrival</p>
                <p className="text-sm text-zinc-400">.00</p>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
