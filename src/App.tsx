import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Mic,
  MicOff,
  Download,
  Edit3,
  RotateCcw,
  FileText,
  Shield,
  Sparkles,
  Clock3,
  CheckCircle2,
  Info,
  CreditCard,
  Lock,
  User,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Usa .svg o .png según tu archivo real
import Logo from "@/assets/cv-voice-white.png";

interface CVData {
  personalInfo: {
    fullName: string;
    email: string;
    phone: string;
    address: string;
    linkedin: string;
    profileImage?: string; // Nueva propiedad opcional
  };
  summary: string;
  experience: Array<{
    position: string;
    company: string;
    duration: string;
    description: string;
  }>;
  education: Array<{
    degree: string;
    institution: string;
    year: string;
  }>;
  skills: string[];
}

type AppState = "initial" | "recording" | "processing" | "editing";

function App() {
  // ------ Estado general ------
  const [state, setState] = useState<AppState>("initial");
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [cvData, setCvData] = useState<CVData | null>(null);
  const [recognitionSupported, setRecognitionSupported] = useState(true);
  const [profileImage, setProfileImage] = useState<string | null>(null); // Nuevo estado
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const { toast } = useToast();

  // ------ Pago / Stripe ------
  const API_BASE = import.meta.env.PROD 
    ? 'https://www.voice-cv.com/api' 
    : 'http://localhost:4242';
  const [uid, setUid] = useState<string>("");
  const [isPaid, setIsPaid] = useState<boolean>(false);
  const [isUsed, setIsUsed] = useState<boolean>(false); // Nuevo estado
  const [canRecord, setCanRecord] = useState<boolean>(false); // Nuevo estado
  const [checkingPayment, setCheckingPayment] = useState<boolean>(true);
  const [buyerEmail, setBuyerEmail] = useState<string>("");

  // ------ Animación typing ------
  const fullTitle = "Tu currículum, dictado por voz";
  const [typed, setTyped] = useState<string>("");
  const [cursorVisible, setCursorVisible] = useState<boolean>(true);

  const DEFAULT_CV: CVData = {
    personalInfo: {
      fullName: "Tu Nombre Completo",
      email: "tu.email@ejemplo.com",
      phone: "+34 000 000 000",
      address: "Ciudad, País",
      linkedin: "linkedin.com/in/tu-perfil",
      profileImage: undefined, // Nueva propiedad
    },
    summary:
      "Profesional orientado/a a resultados, con capacidad de adaptación y aprendizaje continuo. Enfocado/a en aportar valor, comunicar con claridad y ejecutar con calidad.",
    experience: [
      {
        position: "Tu Puesto",
        company: "Nombre de la Empresa",
        duration: "Año - Año",
        description: "Responsabilidades, logros medibles e impacto en resultados.",
      },
    ],
    education: [
      {
        degree: "Tu Titulación",
        institution: "Institución/Universidad",
        year: "Año",
      },
    ],
    skills: ["Comunicación", "Trabajo en Equipo", "Planificación", "Análisis"],
  };

  // ---------- Setup inicial: soporte audio + pago + query success ----------
  useEffect(() => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setRecognitionSupported(false);
      toast({
        title: "Navegador no compatible",
        description:
          "Tu navegador no soporta grabación de audio. Prueba con Chrome, Firefox o Edge.",
        variant: "destructive",
      });
    }
  }, [toast]);

  useEffect(() => {
    // UID persistente para asociar pago
    const existing = localStorage.getItem("cvvoice_uid");
    const newUid =
      existing ||
      (crypto?.randomUUID ? crypto.randomUUID() : `uid_${Date.now()}`);
    if (!existing) localStorage.setItem("cvvoice_uid", newUid);
    setUid(newUid);

    // Captura éxito de Stripe (success=1&uid=...&session_id=...)
    const params = new URLSearchParams(location.search);
    const success = params.get("success");
    const backUid = params.get("uid");
    const sessionId = params.get("session_id");
    
    if (success === "1" && backUid && backUid === newUid && sessionId) {
      // Verificar el pago directamente con Stripe
      verifyPayment(sessionId, newUid);
      toast({ title: "Pago completado ✅", description: "Gracias por tu compra." });
      // Limpia query
      history.replaceState({}, "", location.pathname);
    } else {
      // Comprueba estado de pago en el backend
      (async () => {
        await checkPaymentStatus(newUid);
      })();
    }
  }, []);

  const verifyPayment = async (sessionId: string, uid: string) => {
    try {
      const res = await fetch(`${API_BASE}/verify-payment?session_id=${encodeURIComponent(sessionId)}&uid=${encodeURIComponent(uid)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.paid) {
          // Verificar el estado completo después del pago
          await checkPaymentStatus(uid);
          
          // Forzar actualización del estado si no se actualizó correctamente
          setTimeout(async () => {
            await checkPaymentStatus(uid);
          }, 1000);
          
          toast({ title: "Acceso activado ✅", description: "Ya puedes comenzar a grabar tu CV." });
        }
      }
    } catch (e) {
      console.error("Error verificando pago:", e);
    } finally {
      setCheckingPayment(false);
    }
  };

  // Verificar estado de pago y uso
  const checkPaymentStatus = async (uid: string) => {
    try {
      const res = await fetch(`${API_BASE}/status?uid=${encodeURIComponent(uid)}`);
      if (res.ok) {
        const data = await res.json();
        console.log('Estado recibido del servidor:', data); // Debug log
        
        setIsPaid(data.paid);
        setIsUsed(data.used);
        setCanRecord(data.canRecord);
        
        console.log('Estados actualizados - isPaid:', data.paid, 'isUsed:', data.used, 'canRecord:', data.canRecord); // Debug log
        
        if (data.paid && data.used) {
          toast({
            title: "CV creado exitosamente",
            description: "¡Puedes crear otro CV pagando nuevamente!",
            variant: "default"
          });
        }
      }
    } catch (e) {
      console.error("Error verificando estado:", e);
    } finally {
      setCheckingPayment(false);
    }
  };



  const startCheckout = async () => {
    try {
      const res = await fetch(`${API_BASE}/create-checkout-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid,
          email: buyerEmail || undefined,
        }),
      });
      if (!res.ok) throw new Error("No se pudo crear la sesión de pago");
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url; // Redirección segura a Stripe
      } else {
        throw new Error("URL de Checkout inválida");
      }
    } catch (err: any) {
      console.error(err);
      toast({
        title: "Error con el pago",
        description: err?.message || "No se pudo iniciar el pago.",
        variant: "destructive",
      });
    }
  };

  // Marcar como usado después de completar la grabación
  const markAsUsed = async () => {
    try {
      const res = await fetch(`${API_BASE}/mark-used`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid })
      });
      
      if (res.ok) {
        setIsUsed(true);
        setCanRecord(false);
        console.log("✅ Acceso marcado como usado");
      }
    } catch (e) {
      console.error("Error marcando como usado:", e);
    }
  };

  // ---------- Animación typewriter ----------
  useEffect(() => {
    let i = 0;
    const speed = 35; // ms por carácter
    const timer = setInterval(() => {
      setTyped(fullTitle.slice(0, i + 1));
      i++;
      if (i >= fullTitle.length) clearInterval(timer);
    }, speed);

    const cursorTimer = setInterval(() => {
      setCursorVisible((v) => !v);
    }, 500);

    return () => {
      clearInterval(timer);
      clearInterval(cursorTimer);
    };
  }, []);

  // ---------- Grabación ----------
  const startRecording = async () => {
    if (!canRecord) {
      if (!isPaid) {
        toast({
          title: "Pago requerido",
          description: "Debes pagar 1 € para usar la generación de CV.",
          variant: "destructive",
        });
      } else if (isUsed) {
        toast({
          title: "Acceso ya utilizado",
          description: "Ya has usado tu acceso. Para crear otro CV, necesitas pagar nuevamente.",
          variant: "destructive",
        });
      }
      return;
    }
    if (!recognitionSupported) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setState("recording");
      setTranscript("");

      startVoiceRecognition();

      toast({
        title: "Grabación iniciada",
        description: "Habla de tus datos, experiencia, formación, habilidades y logros.",
      });
    } catch (error) {
      console.error("Error accessing microphone:", error);
      toast({
        title: "Error de micrófono",
        description: "No se pudo acceder al micrófono. Verifica los permisos.",
        variant: "destructive",
      });
      setRecognitionSupported(false);
    }
  };

  const stopRecording = async () => {
    if (mediaRecorderRef.current && isRecording) {
      stopVoiceRecognition();
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setState("processing");

      if (transcript.trim()) {
        const processedCV = await processTextWithAI(transcript);
        setCvData(processedCV);
        setState("editing");
        
        // Marcar como usado después de generar el CV exitosamente
        await markAsUsed();
        
        toast({
          title: "CV generado",
          description: "Puedes revisarlo, editarlo y descargarlo. Tu acceso ha sido utilizado.",
        });
      } else {
        toast({
          title: "No se detectó voz",
          description: "Intenta de nuevo hablando con claridad.",
          variant: "destructive",
        });
        setState("initial");
      }
    }
  };

  // Reconocimiento local (Web Speech API)
  let currentRecognition: any = null;

  const startVoiceRecognition = () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      toast({
        title: "Navegador no compatible",
        description: "Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.",
        variant: "destructive",
      });
      return;
    }

    if (
      location.protocol !== "https:" &&
      location.hostname !== "localhost" &&
      location.hostname !== "127.0.0.1"
    ) {
      toast({
        title: "HTTPS requerido",
        description: "El reconocimiento de voz requiere HTTPS. Usa localhost o un dominio con SSL.",
        variant: "destructive",
      });
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    currentRecognition = new SpeechRecognition();
    currentRecognition.lang = "es-ES";
    currentRecognition.continuous = true;
    currentRecognition.interimResults = true;
    currentRecognition.maxAlternatives = 3;
    if ("webkitSpeechRecognition" in window) {
      // @ts-ignore
      currentRecognition.webkitServiceType = "dictation";
    }

    let finalTranscript = "";
    let silenceTimer: NodeJS.Timeout;
    let lastSpeechTime = Date.now();

    currentRecognition.onresult = (event: any) => {
      let interimTranscript = "";
      lastSpeechTime = Date.now();
      if (silenceTimer) clearTimeout(silenceTimer);

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        const conf = event.results[i][0].confidence;
        if (event.results[i].isFinal) {
          if (conf > 0.6 || conf === undefined) finalTranscript += t + " ";
        } else {
          interimTranscript += t;
        }
      }

      setTranscript(finalTranscript + interimTranscript);

      silenceTimer = setTimeout(() => {
        if (isRecording && currentRecognition && Date.now() - lastSpeechTime > 4000) {
          try {
            currentRecognition.stop();
          } catch {}
        }
      }, 4000);
    };

    currentRecognition.onend = () => {
      if (isRecording) {
        setTimeout(() => {
          try {
            currentRecognition?.start();
          } catch {}
        }, 120);
      }
    };

    try {
      currentRecognition.start();
    } catch (error) {
      toast({
        title: "Error al iniciar reconocimiento",
        description: "Vuelve a intentarlo.",
        variant: "destructive",
      });
    }
  };

  const stopVoiceRecognition = () => {
    if (currentRecognition) {
      try {
        currentRecognition.stop();
      } catch {}
      currentRecognition = null;
    }
  };

  // ------------ INTEGRACIÓN CON GEMINI ------------
  const processTextWithAI = async (text: string): Promise<CVData> => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
    const modelName =
      (import.meta.env.VITE_GEMINI_MODEL as string | undefined) || "gemini-2.0-flash";

    if (!apiKey) {
      toast({
        title: "Falta API Key de Gemini",
        description: "Configura VITE_GEMINI_API_KEY en tu .env. Se usará extracción local básica.",
      });
      return processTextLocally(text);
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: modelName });

      const prompt = [
        "Eres un experto/a en RRHH. A partir de la transcripción hablada del usuario, genera un Curriculum Vitae en ESPAÑOL, neutro y profesional, válido para cualquier sector (sanidad, ventas, ingeniería, educación, hostelería, administración, marketing, logística, etc.).",
        "Devuelve EXCLUSIVAMENTE un JSON válido (sin comentarios ni texto adicional) con este esquema EXACTO:",
        `{
  "personalInfo": {
    "fullName": "string",
    "email": "string",
    "phone": "string",
    "address": "string",
    "linkedin": "string"
  },
  "summary": "string",
  "experience": [
    {
      "position": "string",
      "company": "string",
      "duration": "string",
      "description": "string"
    }
  ],
  "education": [
    {
      "degree": "string",
      "institution": "string",
      "year": "string"
    }
  ],
  "skills": ["string"]
}`,
        "- Si falta un dato, invéntalo de forma razonable y realista.",
        "- En skills, devuelve 6 a 12 competencias relevantes (técnicas o blandas) según lo dicho por el usuario.",
        "- No envuelvas el JSON en backticks ni añadas texto fuera del JSON.",
        "",
        "Transcripción:",
        text,
      ].join("\n");

      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });
      const raw = result.response.text().trim();
      const jsonStr = extractJSON(raw);
      const parsed = JSON.parse(jsonStr);
      const normalized = mergeWithDefaults(parsed);
      return normalized;
    } catch (error) {
      console.error("Gemini error:", error);
      toast({
        title: "Error con la IA",
        description: "No se pudo generar el CV con la IA. Se aplicará extracción local básica.",
        variant: "destructive",
      });
      return processTextLocally(text);
    }
  };

  const extractJSON = (raw: string): string => {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) return fenced[1].trim();
    const first = raw.indexOf("{");
    const last = raw.lastIndexOf("}");
    if (first !== -1 && last !== -1 && last > first) {
      return raw.slice(first, last + 1).trim();
    }
    return raw.trim();
  };

  const mergeWithDefaults = (partial: any): CVData => {
    const d = DEFAULT_CV;
    const pi = partial?.personalInfo || {};
    const personalInfo = {
      fullName: stringOr(pi.fullName, d.personalInfo.fullName),
      email: stringOr(pi.email, d.personalInfo.email),
      phone: stringOr(pi.phone, d.personalInfo.phone),
      address: stringOr(pi.address, d.personalInfo.address),
      linkedin: stringOr(pi.linkedin, d.personalInfo.linkedin),
      profileImage: profileImage || undefined, // Incluir imagen actual
    };

    const experience = Array.isArray(partial?.experience)
      ? partial.experience.map((e: any) => ({
          position: stringOr(e?.position, d.experience[0].position),
          company: stringOr(e?.company, d.experience[0].company),
          duration: stringOr(e?.duration, d.experience[0].duration),
          description: stringOr(e?.description, d.experience[0].description),
        }))
      : d.experience;

    const education = Array.isArray(partial?.education)
      ? partial.education.map((e: any) => ({
          degree: stringOr(e?.degree, d.education[0].degree),
          institution: stringOr(e?.institution, d.education[0].institution),
          year: stringOr(e?.year, d.education[0].year),
        }))
      : d.education;

    const skills =
      Array.isArray(partial?.skills) && partial.skills.length > 0
        ? partial.skills.map((s: any) => (typeof s === "string" ? s : String(s))).slice(0, 14)
        : d.skills;

    const summary = stringOr(partial?.summary, d.summary);
    return { personalInfo, summary, experience, education, skills };
  };

  const stringOr = (v: any, fallback: string): string =>
    typeof v === "string" && v.trim().length > 0 ? v.trim() : fallback;

  // ------------- FALLBACK LOCAL (si no hay IA) -------------
  const processTextLocally = (text: string): CVData => {
    const extracted: CVData = {
      personalInfo: {
        fullName: extractName(text) || DEFAULT_CV.personalInfo.fullName,
        email: extractEmail(text) || DEFAULT_CV.personalInfo.email,
        phone: extractPhone(text) || DEFAULT_CV.personalInfo.phone,
        address: extractAddress(text) || DEFAULT_CV.personalInfo.address,
        linkedin: extractLinkedIn(text) || DEFAULT_CV.personalInfo.linkedin,
      },
      summary: extractSummary(text) || DEFAULT_CV.summary,
      experience: extractExperience(text),
      education: extractEducation(text),
      skills: extractSkills(text),
    };
    return extracted;
  };

  const extractName = (t: string) => {
    const m =
      t.match(
        /(?:me llamo|mi nombre es|soy)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){0,3})/i
      ) || t.match(/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+/);
    return m?.[1] || m?.[0] || "";
  };
  const extractEmail = (t: string) => {
    const m = t.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    return m?.[0] || "";
  };
  const extractPhone = (t: string) => {
    const m =
      t.match(/(?:\+?\d[\d\s-]{6,}\d)/) ||
      t.match(/(?:\+?34\s?)?[6-9]\d{2}\s?\d{3}\s?\d{3}/);
    return m?.[0]?.replace(/\s+/g, " ") || "";
  };
  const extractAddress = (t: string) => {
    const m =
      t.match(/(?:vivo en|resido en|dirección|direccion|ubicado en)\s+([^.;\n]+)/i) ||
      t.match(/\b(Barcelona|Madrid|Valencia|Sevilla|Bilbao)\b/i);
    return (m?.[1] || m?.[0] || "").toString();
  };
  const extractLinkedIn = (t: string) => {
    const m = t.match(/linkedin\.com\/in\/[A-Za-z0-9-]+/i);
    return m?.[0] || "";
  };
  const extractSummary = (t: string) => {
    const m = t.match(/(soy|me considero|mi perfil|mi experiencia|mi objetivo)\s+([^.;]{20,})/i);
    return m ? capitalize(m[2]) : "";
  };
  const extractExperience = (t: string): CVData["experience"] => {
    const list: CVData["experience"] = [];
    const m = t.match(/(trabaj[ée]|experiencia|puesto|cargo|como)\s+([^.;\n]+)\s+(en|para)\s+([^.;\n]+)/i);
    if (m) {
      list.push({
        position: capitalize(m[2]),
        company: capitalize(m[4]),
        duration: "Año - Año",
        description:
          "Responsabilidades clave, logros medibles y contribución al equipo/negocio.",
      });
    }
    if (!list.length) return DEFAULT_CV.experience;
    return list;
  };
  const extractEducation = (t: string): CVData["education"] => {
    const list: CVData["education"] = [];
    const m =
      t.match(
        /(estudi[ée]|grado|licenciatura|máster|master|título|titulo)\s+(en|de)?\s*([^.;\n]+)\s+(en|de)\s+([^.;\n]+)/i
      ) || t.match(/(universidad|instituto|colegio)\s+([^.;\n]+)/i);
    if (m) {
      list.push({
        degree: capitalize(m[3] || "Titulación"),
        institution: capitalize(m[5] || m[2] || "Institución"),
        year: "Año",
      });
    }
    if (!list.length) return DEFAULT_CV.education;
    return list;
  };
  const extractSkills = (t: string): string[] => {
    const base = [
      "Comunicación",
      "Trabajo en Equipo",
      "Organización",
      "Resolución de Problemas",
      "Planificación",
      "Atención al Cliente",
      "Adaptabilidad",
      "Aprendizaje Rápido",
    ];
    const extraDetect: Array<[RegExp, string]> = [
      [/ventas|comercial/i, "Ventas"],
      [/marketing|redes/i, "Marketing"],
      [/gesti[óo]n|coordinaci[óo]n/i, "Gestión"],
      [/calidad|procedimientos/i, "Calidad"],
      [/formaci[óo]n|docencia/i, "Docencia"],
      [/log[íi]stica|almac[ée]n/i, "Logística"],
      [/sanidad|paciente/i, "Atención Sanitaria"],
      [/hosteler[íi]a|restaurante|cocina/i, "Hostelería"],
      [/administraci[óo]n|oficina/i, "Administración"],
      [/finanzas|contabilidad/i, "Finanzas"],
      [/proyecto/i, "Gestión de Proyectos"],
      [/atenci[óo]n telef[óo]nica|call center/i, "Atención Telefónica"],
      [/excel|office|ofim[áa]tica/i, "Ofimática"],
      [/idioma|ingl[ée]s|franc[ée]s|alem[áa]n/i, "Idiomas"],
    ];
    const found = new Set(base);
    extraDetect.forEach(([rgx, name]) => {
      if (rgx.test(t)) found.add(name);
    });
    return Array.from(found).slice(0, 12);
  };
  const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  const updateCVData = (field: keyof CVData, value: any) => {
    if (cvData) setCvData({ ...cvData, [field]: value });
  };
  const updatePersonalInfo = (field: keyof CVData["personalInfo"], value: string) => {
    if (cvData) {
      setCvData({
        ...cvData,
        personalInfo: { ...cvData.personalInfo, [field]: value },
      });
    }
  };
  const addSkill = (skill: string) => {
    if (cvData && skill.trim() && !cvData.skills.includes(skill.trim())) {
      setCvData({ ...cvData, skills: [...cvData.skills, skill.trim()] });
    }
  };
  const removeSkill = (index: number) => {
    if (cvData) {
      setCvData({
        ...cvData,
        skills: cvData.skills.filter((_, i) => i !== index),
      });
    }
  };

  // Función para manejar la carga de imagen
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validación de tipo de archivo
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Error",
        description: "Por favor selecciona un archivo de imagen válido.",
        variant: "destructive",
      });
      return;
    }

    // Validación de tamaño (máximo 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Error",
        description: "La imagen debe ser menor a 5MB.",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64String = e.target?.result as string;
      setProfileImage(base64String);
      if (cvData) {
        setCvData({
          ...cvData,
          personalInfo: {
            ...cvData.personalInfo,
            profileImage: base64String,
          },
        });
      }
      toast({
        title: "Imagen cargada",
        description: "La imagen se ha añadido correctamente al CV.",
      });
    };
    reader.readAsDataURL(file);
  };

  // Función para eliminar la imagen
  const removeProfileImage = () => {
    setProfileImage(null);
    if (cvData) {
      setCvData({
        ...cvData,
        personalInfo: {
          ...cvData.personalInfo,
          profileImage: undefined,
        },
      });
    }
    toast({
      title: "Imagen eliminada",
      description: "La imagen se ha eliminado del CV.",
    });
  };

  const downloadCV = () => {
    if (!cvData) return;
    const cvContent = generateCVHTML(cvData);
    const blob = new Blob([cvContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cvData.personalInfo.fullName.replace(/\s+/g, "_")}_CV.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "CV descargado",
      description: "Se descargó en formato HTML imprimible.",
    });
  };

  const generateCVHTML = (data: CVData): string => {
    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${data.personalInfo.fullName} - Curriculum Vitae</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;line-height:1.6;color:#171717;max-width:840px;margin:0 auto;padding:40px 20px;background:#fff}
h1{font-size:2.2rem;margin-bottom:8px;font-weight:800;letter-spacing:-0.02em}
h2{font-size:1.2rem;margin:26px 0 12px 0;border-bottom:1px solid #111;padding-bottom:6px;font-weight:700}
h3{font-size:1rem;margin-bottom:4px;font-weight:700}
p,li{font-size:0.95rem}
.small{font-size:0.9rem;color:#525252}
.section{margin-bottom:18px}
.block{padding:12px 0;border-bottom:1px solid #eee}
.block:last-child{border-bottom:none}
.tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.tag{background:#111;color:#fff;padding:6px 12px;border-radius:999px;font-size:0.85rem}
.meta{display:flex;gap:12px;color:#404040;font-weight:600;font-size:0.9rem}
.header-content{display:flex;align-items:flex-start;gap:20px;margin-bottom:20px}
.profile-image{width:100px;height:100px;border-radius:50%;object-fit:cover;border:2px solid #ddd;flex-shrink:0}
.header-info{flex:1}
@media print{body{padding:16px}}
</style>
</head>
<body>
<header>
  <div class="header-content">
    ${data.personalInfo.profileImage ? `<img src="${data.personalInfo.profileImage}" alt="Imagen de perfil" class="profile-image" />` : ''}
    <div class="header-info">
      <h1>${escapeHTML(data.personalInfo.fullName)}</h1>
      <div class="meta">
        <span>${escapeHTML(data.personalInfo.email)}</span>
        <span>${escapeHTML(data.personalInfo.phone)}</span>
        <span>${escapeHTML(data.personalInfo.address)}</span>
        <span>${escapeHTML(data.personalInfo.linkedin)}</span>
      </div>
    </div>
  </div>
</header>

<section class="section">
  <h2>Resumen</h2>
  <p>${escapeHTML(data.summary)}</p>
</section>

<section class="section">
  <h2>Experiencia</h2>
  ${data.experience
    .map(
      (e) => `
  <div class="block">
    <h3>${escapeHTML(e.position)} — ${escapeHTML(e.company)}</h3>
    <p class="small">${escapeHTML(e.duration)}</p>
    <p>${escapeHTML(e.description)}</p>
  </div>`
    )
    .join("")}
</section>

<section class="section">
  <h2>Educación</h2>
  ${data.education
    .map(
      (e) => `
  <div class="block">
    <h3>${escapeHTML(e.degree)}</h3>
    <p class="small">${escapeHTML(e.institution)} — ${escapeHTML(e.year)}</p>
  </div>`
    )
    .join("")}
</section>

<section class="section">
  <h2>Habilidades</h2>
  <div class="tags">
    ${data.skills.map((s) => `<span class="tag">${escapeHTML(s)}</span>`).join("")}
  </div>
</section>
</body>
</html>`;
  };

  const escapeHTML = (s: string) =>
    s.replace(/[&<>"']/g, (c) => {
      const map: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      };
      return map[c] || c;
    });

  const resetApp = () => {
    setState("initial");
    setTranscript("");
    setCvData(null);
    setIsRecording(false);
    if (mediaRecorderRef.current) mediaRecorderRef.current = null;
  };

  // ------------------- UI -------------------
  return (
    <div className="min-h-screen bg-white text-black w-full">
      {/* HERO full-bleed */}
      <section className="relative w-full border-b">
        <div className="absolute inset-0 pointer-events-none [background:radial-gradient(60%_40%_at_50%_0%,rgba(0,0,0,0.06),transparent_60%)]" />
        <div className="w-full max-w-[1400px] mx-auto px-6 pt-16 pb-12">
          <div className="flex items-center justify-center mb-8">
            <img src={Logo} alt="CV Voice" className="h-12 md:h-14 select-none" draggable={false} />
          </div>

          {/* Typewriter title */}
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-center mb-4">
            <span>{typed}</span>
            <span
              aria-hidden="true"
              className="inline-block translate-y-[-2px] ml-1 w-[2px] h-[1.2em] bg-black align-middle"
              style={{ opacity: cursorVisible ? 1 : 0 }}
            />
          </h1>

          {/* Paywall badge / status */}
          <div className="flex items-center justify-center mb-4">
            {checkingPayment ? (
              <span className="text-sm text-gray-500">Comprobando acceso…</span>
            ) : isPaid && !isUsed ? (
              <span className="text-sm px-3 py-1 rounded-full bg-green-100 text-green-800">
                Acceso activado
              </span>
            ) : isPaid && isUsed ? (
              <span className="text-sm px-3 py-1 rounded-full bg-red-100 text-red-800">
                Acceso utilizado
              </span>
            ) : (
              <span className="text-sm px-3 py-1 rounded-full bg-yellow-100 text-yellow-800">
                Acceso bloqueado · Pago único 1 €
              </span>
            )}
          </div>

          <p className="text-lg md:text-xl text-gray-600 text-center max-w-4xl mx-auto">
            Habla con naturalidad sobre tu experiencia, formación, habilidades y logros.
            Nuestra IA organiza la información y genera un CV profesional listo para{" "}
            <span className="font-semibold">editar y descargar</span>, válido para{" "}
            <span className="font-semibold">cualquier sector</span>.
          </p>

          {/* CTA zona */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
            {/* Sección de pago y grabación */}
            {!isPaid && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <Lock className="h-5 w-5 text-yellow-600" />
                  <span className="text-yellow-800 font-medium">
                    Pago único de 1 € para generar tu CV profesional
                  </span>
                </div>
                <div className="space-y-3">
                  <Input
                    type="email"
                    placeholder="Tu email (opcional para recibo)"
                    className="border-none focus-visible:ring-0 px-0"
                    value={buyerEmail}
                    onChange={(e) => setBuyerEmail(e.target.value)}
                  />
                </div>
                <Button
                  onClick={startCheckout}
                  size="lg"
                  className="bg-black text-white hover:bg-gray-800 rounded-full px-8 py-6"
                >
                  <CreditCard className="mr-2 h-5 w-5" />
                  Pagar acceso · 1 €
                </Button>
              </div>
            )}

            {/* Mostrar opción de volver a pagar si ya se usó el acceso */}
            {isPaid && isUsed && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <Info className="h-5 w-5 text-blue-600" />
                  <span className="text-blue-800 font-medium">
                    Ya has creado un CV. ¿Quieres crear otro?
                  </span>
                </div>
                <div className="space-y-3">
                  <Input
                    type="email"
                    placeholder="Tu email (opcional para recibo)"
                    className="border-none focus-visible:ring-0 px-0"
                    value={buyerEmail}
                    onChange={(e) => setBuyerEmail(e.target.value)}
                  />
                </div>
                <Button
                  onClick={startCheckout}
                  size="lg"
                  className="bg-black text-white hover:bg-gray-800 rounded-full px-8 py-6"
                >
                  <CreditCard className="mr-2 h-5 w-5" />
                  Crear otro CV · 1 €
                </Button>
              </div>
            )}

            {/* Grabación */}
            {state !== "recording" ? (
              <Button
                onClick={startRecording}
                disabled={!recognitionSupported || !canRecord}
                size="lg"
                className="bg-black text-white hover:bg-gray-800 rounded-full px-8 py-6 disabled:opacity-50"
              >
                <Mic className="mr-2 h-5 w-5" />
                {!isPaid ? "Pagar para grabar" : isUsed ? "Paga para crear otro CV" : "Comenzar grabación"}
              </Button>
            ) : (
              <Button
                onClick={stopRecording}
                size="lg"
                className="bg-black text-white hover:bg-gray-800 rounded-full px-8 py-6"
              >
                <MicOff className="mr-2 h-5 w-5" />
                Detener y generar CV
              </Button>
            )}

            <Button
              onClick={() => window.scrollTo({ top: innerHeight * 1.1, behavior: "smooth" })}
              variant="outline"
              className="rounded-full px-8 py-6 border-black text-black hover:bg-gray-100"
            >
              <Info className="mr-2 h-5 w-5" />
              Cómo funciona
            </Button>
          </div>

          {/* Transcripción en vivo */}
          {state === "recording" && (
            <div className="mt-10">
              <Card className="border-2 border-gray-200">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg font-semibold">Transcripción en tiempo real</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-gray-50 rounded-lg p-5 min-h-[120px]">
                    <p className="text-gray-700 leading-relaxed">
                      {transcript ||
                        "Empieza a hablar: datos de contacto, puestos, tareas, logros, formación, habilidades…"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </section>

      {/* CÓMO FUNCIONA */}
      <section className="w-full">
        <div className="w-full max-w-[1400px] mx-auto px-6 py-14">
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="border-2 border-gray-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Clock3 className="h-5 w-5" />
                  1) Habla
                </CardTitle>
              </CardHeader>
              <CardContent className="text-gray-600">
                Presiona <em>Comenzar grabación</em> y cuenta quién eres, tu experiencia (puestos,
                tareas, logros), formación (títulos, centros, años), habilidades (técnicas y
                blandas) e idiomas.
              </CardContent>
            </Card>

            <Card className="border-2 border-gray-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Sparkles className="h-5 w-5" />
                  2) IA organiza
                </CardTitle>
              </CardHeader>
              <CardContent className="text-gray-600">
                La IA entiende tu relato y lo transforma en un CV estructurado (Resumen,
                Experiencia, Educación y Habilidades) con lenguaje profesional válido para
                cualquier sector.
              </CardContent>
            </Card>

            <Card className="border-2 border-gray-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <CheckCircle2 className="h-5 w-5" />
                  3) Edita y descarga
                </CardTitle>
              </CardHeader>
              <CardContent className="text-gray-600">
                Revisa, ajusta lo necesario y descárgalo en HTML listo para imprimir o convertir a
                PDF. Puedes crear un CV nuevo cuando quieras.
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* PROCESSING */}
      {state === "processing" && (
        <section className="w-full">
          <div className="w-full max-w-[1100px] mx-auto px-6 pb-6">
            <Card className="border-2 border-blue-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-2xl font-semibold">Generando tu CV…</CardTitle>
              </CardHeader>
              <CardContent className="text-gray-600">
                Analizando tu información y organizándola en un formato claro y profesional.
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* EDITING */}
      {state === "editing" && cvData && (
        <section className="w-full">
          <div className="w-full max-w-[1400px] mx-auto px-6 pb-16">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-gray-50 border rounded-xl p-6 mb-8">
              <div className="flex items-center gap-3">
                <FileText className="h-6 w-6" />
                <h2 className="text-2xl font-bold">Editar curriculum</h2>
              </div>
              <div className="flex gap-3">
                <Button onClick={downloadCV} className="bg-black text-white hover:bg-gray-800 px-6">
                  <Download className="mr-2 h-4 w-4" />
                  Descargar
                </Button>
                <Button
                  onClick={resetApp}
                  variant="outline"
                  className="border-black text-black hover:bg-gray-100 px-6"
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Nuevo CV
                </Button>
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-8">
              {/* Form */}
              <div className="space-y-6">
                <Card className="border-2 border-gray-200">
                  <CardHeader>
                    <CardTitle className="flex items-center text-xl">
                      <Edit3 className="mr-2 h-5 w-5" />
                      Datos personales
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Sección de imagen de perfil */}
                    <div>
                      <Label htmlFor="profileImage">Imagen de perfil (opcional)</Label>
                      <div className="mt-2 space-y-3">
                        {(cvData.personalInfo.profileImage || profileImage) ? (
                          <div className="flex items-center gap-4">
                            <img
                              src={cvData.personalInfo.profileImage || profileImage || ""}
                              alt="Imagen de perfil"
                              className="w-20 h-20 rounded-full object-cover border-2 border-gray-200"
                            />
                            <div className="space-y-2">
                              <p className="text-sm text-gray-600">Imagen cargada correctamente</p>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={removeProfileImage}
                                className="text-red-600 hover:text-red-700"
                              >
                                Eliminar imagen
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-4">
                            <div className="w-20 h-20 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center">
                              <User className="h-8 w-8 text-gray-400" />
                            </div>
                            <div className="space-y-2">
                              <Input
                                id="profileImage"
                                type="file"
                                accept="image/*"
                                onChange={handleImageUpload}
                                className="w-full"
                              />
                              <p className="text-xs text-gray-500">
                                Formatos: JPG, PNG, GIF. Máximo 5MB.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <Label htmlFor="fullName">Nombre completo</Label>
                        <Input
                          id="fullName"
                          value={cvData.personalInfo.fullName}
                          onChange={(e) => updatePersonalInfo("fullName", e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={cvData.personalInfo.email}
                          onChange={(e) => updatePersonalInfo("email", e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="phone">Teléfono</Label>
                        <Input
                          id="phone"
                          value={cvData.personalInfo.phone}
                          onChange={(e) => updatePersonalInfo("phone", e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="address">Dirección</Label>
                        <Input
                          id="address"
                          value={cvData.personalInfo.address}
                          onChange={(e) => updatePersonalInfo("address", e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="linkedin">LinkedIn</Label>
                        <Input
                          id="linkedin"
                          value={cvData.personalInfo.linkedin}
                          onChange={(e) => updatePersonalInfo("linkedin", e.target.value)}
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-2 border-gray-200">
                  <CardHeader>
                    <CardTitle className="text-xl">Resumen</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={cvData.summary}
                      onChange={(e) => updateCVData("summary", e.target.value)}
                      className="min-h-[120px] resize-none"
                      placeholder="Describe brevemente tu perfil, fortalezas e intereses profesionales…"
                    />
                  </CardContent>
                </Card>

                <Card className="border-2 border-gray-200">
                  <CardHeader>
                    <CardTitle className="text-xl">Habilidades</CardTitle>
                  </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {cvData.skills.map((skill, index) => (
                        <span
                          key={index}
                          className="bg-black text-white px-3 py-1 rounded-full text-sm flex items-center gap-2 cursor-pointer hover:bg-gray-800"
                          title="Haz clic para quitar"
                          onClick={() => removeSkill(index)}
                        >
                          {skill}
                          <span className="text-xs opacity-70">×</span>
                        </span>
                      ))}
                    </div>
                    <Input
                      placeholder="Añade una habilidad y pulsa Enter…"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const input = e.target as HTMLInputElement;
                          if (input.value.trim()) {
                            addSkill(input.value.trim());
                            input.value = "";
                          }
                        }
                      }}
                    />
                  </CardContent>
                </Card>
              </div>

              {/* Preview */}
              <div className="space-y-6">
                <Card className="border-2 border-gray-200">
                  <CardHeader>
                    <CardTitle className="text-xl">Vista previa</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-white p-8 rounded-lg shadow-lg max-h-[800px] overflow-y-auto">
                      <div className="space-y-6">
                        <div className="border-b border-gray-200 pb-4">
                          <div className="flex items-start gap-4">
                            {/* Imagen de perfil en la vista previa */}
                            {(cvData.personalInfo.profileImage || profileImage) && (
                              <img
                                src={cvData.personalInfo.profileImage || profileImage || ""}
                                alt="Imagen de perfil"
                                className="w-24 h-24 rounded-full object-cover border-2 border-gray-200 flex-shrink-0"
                              />
                            )}
                            <div className="flex-1">
                              <h1 className="text-2xl font-bold text-black mb-2">
                                {cvData.personalInfo.fullName}
                              </h1>
                              <div className="space-y-1 text-gray-600 text-sm">
                                <p>
                                  <strong>Email:</strong> {cvData.personalInfo.email}
                                </p>
                                <p>
                                  <strong>Teléfono:</strong> {cvData.personalInfo.phone}
                                </p>
                                <p>
                                  <strong>Dirección:</strong> {cvData.personalInfo.address}
                                </p>
                                <p>
                                  <strong>LinkedIn:</strong> {cvData.personalInfo.linkedin}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>

                      <div className="mb-6">
                        <h2 className="text-lg font-semibold text-black mb-2 border-b border-black pb-1">
                          Resumen
                        </h2>
                        <p className="text-gray-700 italic leading-relaxed">{cvData.summary}</p>
                      </div>

                      <div className="mb-6">
                        <h2 className="text-lg font-semibold text-black mb-2 border-b border-black pb-1">
                          Experiencia
                        </h2>
                        {cvData.experience.map((exp, index) => (
                          <div key={index} className="mb-4 last:mb-0">
                            <h3 className="font-medium text-black">
                              {exp.position} — {exp.company}
                            </h3>
                            <p className="text-gray-600 text-xs font-medium">{exp.duration}</p>
                            <p className="text-gray-700 mt-1">{exp.description}</p>
                          </div>
                        ))}
                      </div>

                      <div className="mb-6">
                        <h2 className="text-lg font-semibold text-black mb-2 border-b border-black pb-1">
                          Educación
                        </h2>
                        {cvData.education.map((edu, index) => (
                          <div key={index} className="mb-3 last:mb-0">
                            <h3 className="font-medium text-black">{edu.degree}</h3>
                            <p className="text-gray-700">
                              {edu.institution} — {edu.year}
                            </p>
                          </div>
                        ))}
                      </div>

                      <div>
                        <h2 className="text-lg font-semibold text-black mb-2 border-b border-black pb-1">
                          Habilidades
                        </h2>
                        <div className="flex flex-wrap gap-1">
                          {cvData.skills.map((skill, index) => (
                            <span key={index} className="bg-black text-white px-2 py-1 rounded text-xs">
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* PRIVACIDAD / CONSEJOS */}
      <section className="w-full">
        <div className="w-full max-w-[1400px] mx-auto px-6 pb-14">
          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="border-2 border-gray-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Shield className="h-5 w-5" />
                  Privacidad
                </CardTitle>
              </CardHeader>
              <CardContent className="text-gray-600">
                Puedes usar la app sin almacenar tu audio en servidores propios: la transcripción
                ocurre en tu navegador. El CV generado se queda en tu sesión y puedes eliminarlo
                cuando quieras con “Nuevo CV”.
              </CardContent>
            </Card>

            <Card className="border-2 border-gray-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Info className="h-5 w-5" />
                  Consejos para hablar
                </CardTitle>
              </CardHeader>
              <CardContent className="text-gray-600 space-y-2">
                <p>• Di tu nombre, email, teléfono y ciudad.</p>
                <p>• Resume tu perfil (qué sabes hacer, en qué aportas, qué te interesa).</p>
                <p>• Experiencia: puesto, empresa, fechas y 2-3 logros medibles.</p>
                <p>• Educación: titulación, centro y año.</p>
                <p>• Habilidades: técnicas y blandas (idiomas incluidos).</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <Toaster />
    </div>
  );
}

export default App;
