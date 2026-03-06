
"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, query, where, onSnapshot, type FirestoreError } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { PublicHeader } from "@/components/public-header";
import { PublicFooter } from "@/components/public-footer";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Loader2, Box, Search, Info, Gift, Sparkles, Tag, AlertCircle, 
  ExternalLink, ShoppingCart, ShoppingBag, Plus, Minus, Trash2, 
  CreditCard, CheckCircle2
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  Sheet, 
  SheetContent, 
  SheetDescription, 
  SheetHeader, 
  SheetTitle, 
  SheetTrigger,
  SheetFooter
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import type { Part, PartCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

export const dynamic = 'force-dynamic';

interface CartItem extends Part {
  quantity: number;
}

export default function PublicProductsPage() {
  const { db } = useFirebase();
  const { toast } = useToast();
  
  const [parts, setParts] = useState<Part[]>([]);
  const [categories, setCategories] = useState<PartCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [indexErrorUrl, setIndexErrorUrl] = useState<string | null>(null);
  
  // Cart State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  // 1. Fetch Categories
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, "partCategories"));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as PartCategory));
      data.sort((a, b) => a.name.localeCompare(b.name, 'th'));
      setCategories(data);
    });
    return () => unsub();
  }, [db]);

  // 2. Fetch Web Parts
  useEffect(() => {
    if (!db) return;
    setIndexErrorUrl(null);
    setLoading(true);
    const q = query(collection(db, "parts"), where("showOnWeb", "==", true));
    const unsubscribe = onSnapshot(q, {
      next: (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Part));
        data.sort((a, b) => a.name.localeCompare(b.name, 'th'));
        setParts(data);
        setLoading(false);
      },
      error: (err: FirestoreError) => {
        console.error("Public Parts Error:", err);
        if (err.message?.includes('requires an index')) {
          const urlMatch = err.message.match(/https?:\/\/[^\s]+/);
          if (urlMatch) setIndexErrorUrl(urlMatch[0]);
        }
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [db]);

  // Filter Logic
  const filteredParts = useMemo(() => {
    let result = [...parts];
    if (activeCategory !== "ALL") {
      result = result.filter(p => p.categoryId === activeCategory);
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(p => 
        p.name.toLowerCase().includes(q) || 
        p.code.toLowerCase().includes(q)
      );
    }
    return result;
  }, [parts, activeCategory, searchTerm]);

  // Cart Logic
  const addToCart = (part: Part) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === part.id);
      if (existing) {
        toast({ title: "เพิ่มจำนวนสินค้าแล้ว", description: `เพิ่ม ${part.name} ลงในตะกร้าเรียบร้อย` });
        return prev.map(item => 
          item.id === part.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      toast({ title: "เพิ่มลงตะกร้าแล้ว", description: `เพิ่ม ${part.name} ลงในตะกร้าเรียบร้อย` });
      return [...prev, { ...part, quantity: 1 }];
    });
  };

  const updateQuantity = (partId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === partId) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const removeFromCart = (partId: string) => {
    setCart(prev => prev.filter(item => item.id !== partId));
    toast({ title: "นำสินค้าออกแล้ว", description: "ลบรายการออกจากตะกร้าเรียบร้อย" });
  };

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => {
      const price = item.webPrice || item.sellingPrice;
      return sum + (price * item.quantity);
    }, 0);
  }, [cart]);

  const cartCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  const handleCheckout = () => {
    toast({
      title: "กำลังดำเนินการ",
      description: "ระบบกำลังเตรียมข้อมูลใบสั่งซื้อ กรุณารอเจ้าหน้าที่ติดต่อกลับนะคะ",
    });
    // In a real app, this would redirect to a checkout page or WhatsApp
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <PublicHeader />

      <main className="flex-1 pt-24 pb-20">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-10">
            <div className="animate-in fade-in slide-in-from-left-4 duration-700">
              <h1 className="text-4xl font-bold text-slate-900 mb-2">สินค้าและอะไหล่</h1>
              <p className="text-slate-500">เลือกชมรายการอะไหล่คุณภาพมาตรฐานจาก Sahadiesel พร้อมโปรโมชั่นพิเศษ</p>
            </div>
            
            <div className="flex w-full md:w-auto items-center gap-3">
              <div className="relative flex-1 md:w-80 animate-in fade-in slide-in-from-right-4 duration-700">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input 
                  placeholder="ค้นหาชื่อ หรือ รหัสอะไหล่..." 
                  className="pl-10 bg-white shadow-sm border-slate-200 h-11 rounded-full focus:ring-primary" 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>

              {/* Shopping Cart Trigger */}
              <Sheet open={isCartOpen} onOpenChange={setIsCartOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" className="relative h-11 w-11 rounded-full border-slate-200 bg-white shadow-sm hover:bg-slate-50 shrink-0">
                    <ShoppingCart className="h-5 w-5 text-slate-700" />
                    {cartCount > 0 && (
                      <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-primary text-white border-white">
                        {cartCount}
                      </Badge>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-full sm:max-w-md flex flex-col p-0 overflow-hidden">
                  <SheetHeader className="p-6 border-b bg-slate-50/50">
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="h-5 w-5 text-primary" />
                      <SheetTitle>ตะกร้าสินค้าของคุณ</SheetTitle>
                    </div>
                    <SheetDescription>
                      รายการสินค้าที่รอการสั่งซื้อ
                    </SheetDescription>
                  </SheetHeader>

                  <ScrollArea className="flex-1">
                    {cart.length > 0 ? (
                      <div className="p-6 space-y-6">
                        {cart.map(item => (
                          <div key={item.id} className="flex gap-4 items-start">
                            <div className="relative h-16 w-16 rounded-lg bg-slate-100 overflow-hidden border shrink-0">
                              {item.imageUrl ? (
                                <Image src={item.imageUrl} alt={item.name} fill className="object-cover" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-slate-300"><Box className="h-6 w-6 opacity-30" /></div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0 space-y-1">
                              <p className="font-bold text-sm text-slate-900 line-clamp-1">{item.name}</p>
                              <p className="text-xs text-primary font-bold">฿{(item.webPrice || item.sellingPrice).toLocaleString()} / ชิ้น</p>
                              
                              <div className="flex items-center justify-between pt-2">
                                <div className="flex items-center gap-3 bg-slate-100 rounded-full px-2 py-1">
                                  <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full hover:bg-white" onClick={() => updateQuantity(item.id, -1)}><Minus className="h-3 w-3" /></Button>
                                  <span className="text-xs font-bold w-4 text-center">{item.quantity}</span>
                                  <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full hover:bg-white" onClick={() => updateQuantity(item.id, 1)}><Plus className="h-3 w-3" /></Button>
                                </div>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-destructive" onClick={() => removeFromCart(item.id)}><Trash2 className="h-4 w-4" /></Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400 gap-4">
                        <ShoppingBag className="h-16 w-16 opacity-10" />
                        <p className="text-sm font-medium">ยังไม่มีสินค้าในตะกร้าค่ะ</p>
                        <Button variant="outline" className="rounded-full" onClick={() => setIsCartOpen(false)}>เลือกชมสินค้า</Button>
                      </div>
                    )}
                  </ScrollArea>

                  {cart.length > 0 && (
                    <div className="p-6 border-t bg-slate-50/50 space-y-4">
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">จำนวนทั้งหมด</span>
                          <span className="font-medium">{cartCount} ชิ้น</span>
                        </div>
                        <div className="flex justify-between text-lg font-black text-slate-900">
                          <span>ยอดรวมทั้งสิ้น</span>
                          <span className="text-primary">฿{cartTotal.toLocaleString()}</span>
                        </div>
                      </div>
                      <Button className="w-full h-12 rounded-xl text-base font-bold gap-2 shadow-lg shadow-primary/20" onClick={handleCheckout}>
                        <CreditCard className="h-5 w-5" /> ชำระเงิน / สั่งซื้อ
                      </Button>
                    </div>
                  )}
                </SheetContent>
              </Sheet>
            </div>
          </div>

          {indexErrorUrl && (
            <Alert variant="destructive" className="mb-10">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>ต้องสร้างดัชนี (Index) เพื่อแสดงข้อมูล</AlertTitle>
              <AlertDescription className="flex flex-col gap-2 mt-2">
                <span>ระบบต้องการดัชนีเพื่อจัดเรียงสินค้า กรุณาแจ้งผู้ดูแลระบบเพื่อกดปุ่มด้านล่างเพื่อสร้าง Index</span>
                <Button asChild variant="outline" size="sm" className="w-fit bg-white text-destructive hover:bg-muted">
                  <a href={indexErrorUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    สร้าง Index (Firebase Console)
                  </a>
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <Tabs defaultValue="ALL" className="space-y-8" onValueChange={setActiveCategory}>
            <div className="overflow-x-auto pb-4 -mx-4 px-4 hide-scrollbar">
              <TabsList className="bg-transparent h-auto p-0 flex justify-start gap-3">
                <TabsTrigger 
                  value="ALL" 
                  className="data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:border-primary bg-white border border-slate-200 px-8 py-2.5 rounded-full shadow-sm text-sm font-bold transition-all duration-300"
                >
                  ทั้งหมด
                </TabsTrigger>
                {categories.map(cat => (
                  <TabsTrigger 
                    key={cat.id} 
                    value={cat.id}
                    className="data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:border-primary bg-white border border-slate-200 px-8 py-2.5 rounded-full shadow-sm text-sm font-bold transition-all duration-300"
                  >
                    {cat.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <TabsContent value={activeCategory} className="mt-0">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-32 gap-4">
                  <Loader2 className="animate-spin h-12 w-12 text-primary opacity-20" />
                  <p className="text-slate-400 text-sm animate-pulse">กำลังเตรียมรายการสินค้า...</p>
                </div>
              ) : filteredParts.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-8">
                  {filteredParts.map(part => {
                    const hasSpecialPrice = part.webPrice && part.webPrice < part.sellingPrice;
                    const discountPercent = hasSpecialPrice ? Math.round(((part.sellingPrice - part.webPrice!) / part.sellingPrice) * 100) : 0;
                    const isInCart = cart.some(item => item.id === part.id);

                    return (
                      <Card key={part.id} className="group border-none shadow-sm hover:shadow-2xl transition-all duration-500 overflow-hidden bg-white flex flex-col h-full ring-1 ring-slate-200/50">
                        {/* Image Container */}
                        <div className="relative aspect-square bg-slate-50 overflow-hidden">
                          {part.imageUrl ? (
                            <Image 
                              src={part.imageUrl} 
                              alt={part.name} 
                              fill 
                              className="object-cover transition-transform duration-700 group-hover:scale-110"
                              sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-slate-200">
                              <Box className="h-20 w-20 opacity-10" />
                            </div>
                          )}
                          
                          {/* Badges */}
                          <div className="absolute top-2 left-2 flex flex-col gap-1.5">
                            {discountPercent > 0 && (
                              <Badge className="bg-red-600 text-white font-black border-none px-2 rounded-md shadow-lg text-[10px]">
                                  ลด {discountPercent}%
                              </Badge>
                            )}
                            {part.webPromoNote && (
                              <Badge className="bg-orange-500 border-none shadow-lg animate-in slide-in-from-left-2 text-[10px]">
                                  <Sparkles className="h-3 w-3 mr-1" /> HOT
                              </Badge>
                            )}
                          </div>

                          {part.stockQty <= 0 && (
                            <div className="absolute inset-0 bg-white/80 backdrop-blur-[2px] flex items-center justify-center z-10">
                              <Badge variant="destructive" className="px-4 py-1.5 text-xs font-bold rounded-full border-none shadow-xl uppercase tracking-wider">สินค้าหมด</Badge>
                            </div>
                          )}

                          {/* Quick Add Overlay (Desktop) */}
                          <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center p-4">
                             {part.stockQty > 0 && (
                                <Button className="w-full bg-white text-slate-900 hover:bg-primary hover:text-white rounded-full shadow-2xl transition-all translate-y-4 group-hover:translate-y-0 duration-300" onClick={() => addToCart(part)}>
                                    <ShoppingCart className="h-4 w-4 mr-2" />
                                    เลือกใส่ตะกร้า
                                </Button>
                             )}
                          </div>
                        </div>

                        {/* Content */}
                        <CardContent className="p-4 flex-grow space-y-3">
                          <div className="min-h-[48px]">
                            <h3 className="text-sm font-bold line-clamp-2 leading-tight text-slate-800 group-hover:text-primary transition-colors">
                              {part.name}
                            </h3>
                            <p className="text-[10px] text-slate-400 font-mono mt-1 uppercase tracking-tighter">{part.code}</p>
                          </div>

                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[9px] h-4 font-bold border-slate-100 text-slate-400 bg-slate-50 uppercase tracking-widest">
                              {part.categoryNameSnapshot}
                            </Badge>
                          </div>

                          <div className="pt-1">
                            <div className="flex items-baseline gap-2">
                                <span className="text-xl font-black text-primary">฿{(part.webPrice || part.sellingPrice).toLocaleString()}</span>
                                {hasSpecialPrice && (
                                    <span className="text-[10px] text-slate-400 line-through decoration-slate-300">฿{part.sellingPrice.toLocaleString()}</span>
                                )}
                            </div>
                            
                            {part.bulkPrice && part.bulkPrice > 0 && (
                                <div className="flex items-center gap-1 text-[9px] text-green-600 font-bold bg-green-50/50 border border-green-100 px-1.5 py-0.5 rounded w-fit mt-1.5">
                                    <Tag className="h-2.5 w-2.5" />
                                    {part.bulkPrice.toLocaleString()}.- เมื่อซื้อ {part.bulkPriceQty}+
                                </div>
                            )}
                          </div>

                          {part.webPromoNote && (
                              <div className="text-[10px] text-orange-600 font-bold flex items-start gap-1.5 p-2 bg-orange-50 rounded-lg animate-in fade-in zoom-in-95">
                                  <Gift className="h-3 w-3 shrink-0 mt-0.5" />
                                  <span className="leading-tight">{part.webPromoNote}</span>
                              </div>
                          )}
                        </CardContent>

                        {/* Mobile Add Button */}
                        <CardFooter className="p-4 pt-0 md:hidden">
                           <Button 
                            className={cn(
                              "w-full rounded-full h-10 text-xs font-bold gap-2 shadow-sm transition-all",
                              isInCart ? "bg-green-600 hover:bg-green-700" : "bg-slate-900 hover:bg-primary"
                            )} 
                            onClick={() => addToCart(part)}
                            disabled={part.stockQty <= 0}
                           >
                            {isInCart ? <CheckCircle2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                            {isInCart ? "เพิ่มแล้ว" : "ใส่ตะกร้า"}
                          </Button>
                        </CardFooter>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-32 bg-white rounded-3xl border-2 border-dashed border-slate-200 animate-in fade-in zoom-in-95 duration-500">
                  <div className="bg-slate-50 p-6 rounded-full w-fit mx-auto mb-6">
                    <Box className="h-16 w-16 text-slate-200" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">ไม่พบสินค้าในหมวดนี้ค่ะ</h3>
                  <p className="text-slate-400 text-sm max-w-xs mx-auto">ลองเปลี่ยนหมวดหมู่หรือใช้คำค้นหาอื่นดูนะคะ ทีมงานกำลังทยอยเพิ่มสินค้าใหม่ๆ อยู่ค่ะ</p>
                  <Button variant="link" className="mt-4 text-primary font-bold" onClick={() => { setActiveCategory("ALL"); setSearchTerm(""); }}>ดูสินค้าทั้งหมด</Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
