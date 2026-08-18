export type Rol = "admin" | "client" | "operador";

export type PublicUser = {
  id: string;
  username: string | null;
  email: string | null;
  role: Rol;
  company_name: string | null;
  person_type: string | null;
  cuit: string | null;
  iva_condition: string | null;
  /** Certificado MiPyME o de exclusión vigente ('si' | 'no' | null). */
  cert_exencion: string | null;
  /** Tipo de carta de garantía para retirar contenedores ('anual' | 'puntual' | 'no' | null). */
  carta_garantia: string | null;
  contact_name: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
  // Onboarding para operar: 'none' | 'submitted' | 'approved' | 'rejected'.
  op_status: string | null;
  op_application: string | null;
  op_rejection_reason: string | null;
  op_meeting_at: string | null;
  op_submitted_at: string | null;
  op_reviewed_at: string | null;
  /** Acceso al portal self-service habilitado por el estudio ('1' = sí). */
  portal_habilitado: string | null;
  /** Nombre del archivo del logo del estudio (los bytes viven en disco). */
  logo: string | null;
};
