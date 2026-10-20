import { extname } from 'node:path';

/**
 * Contenido real de los 50 archivos del seed.
 *
 * Cada entrada se identifica por la clave del archivo (`SeedFile.key`) y se
 * renderiza según la extensión: encabezado Markdown para `.md` y título
 * subrayado para `.txt`. El texto se escribe en GridFS tal cual, de modo que
 * `size` y `contentHash` se calculan sobre el mismo buffer.
 */
export interface SeedDocumentContent {
  title: string;
  paragraphs: string[];
}

/** Renderiza el contenido final de un archivo del seed. */
export function renderSeedContent(
  fileName: string,
  content: SeedDocumentContent,
): string {
  const extension = extname(fileName).toLowerCase();

  if (extension === '.md') {
    const body = content.paragraphs.join('\n\n');
    return `# ${content.title}\n\n${body}\n`;
  }

  const underline = '='.repeat(content.title.length);
  const body = content.paragraphs.join('\n\n');
  return `${content.title}\n${underline}\n\n${body}\n`;
}

/**
 * Catálogo de contenidos. Los textos son documentos de ejemplo con información
 * verosímil para que los listados, las descargas y los reportes tengan sentido.
 */
export const SEED_CONTENT: Record<string, SeedDocumentContent> = {
  'ana-informe-anual': {
    title: 'Informe anual de proyectos 2026',
    paragraphs: [
      'Durante el ejercicio 2026 el área de proyectos ejecutó doce iniciativas, de las cuales diez cerraron dentro del presupuesto aprobado. El equipo incorporó una revisión mensual de riesgos que permitió anticipar retrasos en la cadena de suministro y reasignar recursos sin afectar las fechas de entrega comprometidas.',
      'Los resultados más relevantes fueron la reducción de un 18 % en el tiempo de puesta en marcha de nuevos clientes y la consolidación del portal de seguimiento, utilizado por 64 usuarios internos. La satisfacción medida al cierre de cada proyecto se mantuvo por encima de 4,5 sobre 5.',
      'Para 2027 se recomienda reforzar la documentación de traspaso entre equipos, automatizar el tablero de indicadores y reservar una partida específica para formación. Estas acciones permitirán sostener el crecimiento sin aumentar proporcionalmente la carga operativa.',
    ],
  },
  'ana-informe-q1': {
    title: 'Informe trimestral — primer trimestre 2026',
    paragraphs: [
      'El primer trimestre cerró con ocho proyectos activos y dos finalizados. La facturación alcanzó el 96 % de la meta, impulsada por los servicios de consultoría y por la renovación de tres contratos anuales.',
      'Se detectaron demoras en la validación de proveedores durante enero y febrero. El equipo ajustó el flujo de aprobación y redujo el tiempo medio de alta de 11 a 6 días hábiles. También se actualizaron las plantillas de acta y de informe de avance.',
      'Como siguiente paso queda pendiente completar la migración documental del archivo histórico y capacitar a los nuevos integrantes en el procedimiento de gestión de cambios.',
    ],
  },
  'ana-informe-q2': {
    title: 'Informe trimestral — segundo trimestre 2026',
    paragraphs: [
      'Entre abril y junio se incorporaron cuatro clientes nuevos y se renovaron cinco contratos. El margen operativo mejoró dos puntos respecto al trimestre anterior gracias a la estandarización de las propuestas técnicas.',
      'La encuesta interna de clima laboral mostró una mejora en la claridad de objetivos. Sin embargo, el equipo señaló la necesidad de reducir reuniones recurrentes y de contar con un repositorio único de plantillas.',
      'Se propone consolidar la documentación en carpetas por cliente, con permisos de solo lectura para las áreas de apoyo, y revisar trimestralmente los accesos otorgados.',
    ],
  },
  'ana-informe-q3': {
    title: 'Informe trimestral — tercer trimestre 2026',
    paragraphs: [
      'El tercer trimestre registró el mayor volumen de entregables del año. Se completaron 27 documentos técnicos y se realizaron 14 sesiones de validación con clientes.',
      'El indicador de retrabajo bajó del 9 % al 5 % tras la incorporación de una lista de verificación obligatoria antes de cada entrega. La lista se basa en los errores más frecuentes detectados en las revisiones de calidad.',
      'Quedan abiertos dos frentes: la conciliación de inventarios de fin de año y la actualización de las políticas de respaldo. Ambos se abordarán en el último trimestre con responsables asignados.',
    ],
  },
  'ana-acta-01': {
    title: 'Acta de reunión — enero 2026',
    paragraphs: [
      'La reunión se realizó el 15 de enero con la participación del equipo de proyectos, administración y soporte. Se revisó el estado de los compromisos pendientes del año anterior y se confirmó el cierre de los contratos observados.',
      'Se acordó que cada responsable enviará su plan de trabajo antes del último viernes del mes. Administración consolidará la información y publicará una versión única en la carpeta compartida de Proyectos.',
      'Próxima reunión: 12 de febrero. Temas previstos: avance del portal de seguimiento, presupuesto de formación y estado de los proveedores críticos.',
    ],
  },
  'ana-acta-05': {
    title: 'Acta de reunión — mayo 2026',
    paragraphs: [
      'Se evaluó el cierre del primer cuatrimestre y se identificaron tres desviaciones: dos por retraso de proveedores y una por cambio de alcance solicitado por el cliente. Las tres cuentan con plan de recuperación aprobado.',
      'El equipo de soporte presentó la nueva clasificación de incidencias. Se acordó usar cuatro niveles de severidad y registrar el tiempo de primera respuesta en el sistema de seguimiento.',
      'Se recuerda la obligación de subir toda la documentación de reunión a la carpeta correspondiente en un plazo máximo de 48 horas. El acceso a las carpetas de clientes se revisará mensualmente.',
    ],
  },
  'ana-acta-09': {
    title: 'Acta de reunión — septiembre 2026',
    paragraphs: [
      'La sesión se centró en la preparación del cierre anual. Se confirmó el calendario de entregables y se asignaron responsables para la conciliación de inventarios y la actualización de políticas internas.',
      'Se aprobó el uso de la plantilla única de informe trimestral y se acordó que las excepciones deberán justificarse por escrito. También se definió el procedimiento para restaurar documentos eliminados por error desde la papelera.',
      'Los acuerdos quedan registrados en esta acta. Cualquier modificación posterior deberá reflejarse en una nueva versión y notificarse a los participantes.',
    ],
  },
  'ana-cierre-2025': {
    title: 'Cierre de proyecto 2025 — modernización documental',
    paragraphs: [
      'El proyecto de modernización documental concluyó con la digitalización de 4.300 expedientes y la puesta en marcha de un repositorio centralizado. El equipo cumplió el alcance acordado y entregó la documentación técnica completa.',
      'La solución permitió reducir el tiempo de búsqueda de documentos de 15 a 2 minutos en promedio. Se capacitó a 38 usuarios y se elaboraron manuales de uso y de administración.',
      'Como lección aprendida, se recomienda definir desde el inicio los criterios de nomenclatura y los permisos por carpeta. Esto evita reprocesos cuando el volumen de documentos crece.',
    ],
  },
  'ana-lecciones': {
    title: 'Lecciones aprendidas del proyecto 2025',
    paragraphs: [
      'La planificación temprana de la estructura de carpetas redujo la necesidad de mover archivos entre áreas. Los equipos que participaron en el diseño inicial adoptaron el repositorio con menos resistencia.',
      'Los principales problemas surgieron por nombres duplicados y por permisos concedidos sin fecha de revisión. Se recomienda validar ambos aspectos antes de abrir una carpeta a usuarios externos.',
      'La documentación de traspaso debe incluir el propósito de cada carpeta, el responsable y la política de retención. Un documento de una página por carpeta resultó suficiente para orientar a los nuevos integrantes.',
    ],
  },
  'ana-plan': {
    title: 'Plan de proyecto — repositorio documental',
    paragraphs: [
      'El objetivo del proyecto es centralizar la documentación operativa en un repositorio único, con control de acceso por carpeta y trazabilidad de las acciones realizadas por los usuarios.',
      'El alcance incluye la migración de los documentos activos, la definición de una estructura de carpetas por área y la capacitación de los equipos. Quedan fuera del alcance la digitalización física y la integración con sistemas externos.',
      'Los hitos principales son: diagnóstico y diseño en la semana 2, migración piloto en la semana 5, despliegue general en la semana 8 y cierre con auditoría en la semana 10. El riesgo principal es la disponibilidad de los responsables de área.',
    ],
  },
  'ana-presupuesto': {
    title: 'Presupuesto 2026 — área de proyectos',
    paragraphs: [
      'El presupuesto aprobado asciende a 240.000 unidades e incluye personal, licencias, formación y una reserva del 8 % para imprevistos. La partida de personal representa el 62 % del total.',
      'Se prevé un ahorro por la consolidación de herramientas de seguimiento y por la reducción de licencias duplicadas. La formación se concentrará en el primer semestre para acompañar la incorporación de nuevos integrantes.',
      'El seguimiento será mensual. Cualquier desviación superior al 5 % deberá justificarse ante administración y contar con un plan de recuperación documentado.',
    ],
  },
  'ana-manual-usuario': {
    title: 'Manual de usuario del gestor documental',
    paragraphs: [
      'El gestor documental permite crear carpetas, subir archivos de texto y compartir recursos con otros usuarios. Cada usuario trabaja sobre su propio espacio y puede acceder a los recursos que le hayan compartido.',
      'Para subir un archivo, seleccione la carpeta de destino y utilice el botón de carga. Solo se admiten archivos .txt y .md de hasta 5 MB. El sistema valida el contenido y rechaza binarios renombrados.',
      'Los permisos se asignan por archivo o carpeta y se heredan hacia el contenido. Si un documento no aparece, verifique que no esté en la papelera y que su permiso siga vigente.',
    ],
  },
  'ana-guia-instalacion': {
    title: 'Guía de instalación del entorno local',
    paragraphs: [
      'El backend requiere Node.js 20 o superior y una instancia de MongoDB accesible. Las variables de conexión y la clave de firma de tokens se configuran en el archivo .env a partir de .env.example.',
      'Los pasos básicos son: instalar dependencias con npm install, iniciar MongoDB, ejecutar npm run seed para cargar datos de prueba y arrancar el servidor con npm run start:dev. El servicio queda disponible en el puerto 3000.',
      'Si la conexión falla, revise la cadena MONGODB_URI y que el puerto 27017 esté escuchando. Los datos de prueba se pueden recargar en cualquier momento; el seed elimina la base antes de insertar.',
    ],
  },
  'ana-manual-admin': {
    title: 'Manual de administración',
    paragraphs: [
      'El rol ADMIN gestiona usuarios y consulta reportes globales, pero no obtiene acceso implícito al contenido de los archivos. Para ver un documento ajeno se requiere una compartición explícita.',
      'La creación de usuarios se realiza desde el módulo de administración. Al desactivar una cuenta se conservan sus recursos e historial; el usuario simplemente no podrá autenticarse hasta ser reactivado.',
      'Los reportes se calculan con aggregation pipelines sobre las colecciones de archivos, comparticiones e historial. Se recomienda revisar periódicamente el almacenamiento por usuario y las comparticiones sin fecha de revisión.',
    ],
  },
  'ana-politica-privacidad': {
    title: 'Política de privacidad y tratamiento de datos',
    paragraphs: [
      'Los documentos almacenados pueden contener información confidencial de clientes. El acceso se limita al propietario y a los usuarios con permiso explícito, y toda descarga queda registrada en el historial de actividad.',
      'Los datos personales deben tratarse únicamente para la finalidad declarada. No se permite copiar documentos a dispositivos personales ni compartirlos por canales no autorizados.',
      'Las solicitudes de acceso, rectificación o eliminación se canalizan a través de administración. Los recursos eliminados permanecen en la papelera hasta su purga definitiva, que también queda auditada.',
    ],
  },
  'ana-politica-respaldo': {
    title: 'Política de respaldo y recuperación',
    paragraphs: [
      'La base de datos se respalda diariamente y los respaldos se conservan durante treinta días. El contenido de los archivos vive en GridFS y se incluye en la misma copia que los metadatos.',
      'Cada trimestre se realiza una prueba de restauración en un entorno aislado. La prueba debe confirmar la integridad de los documentos, la coherencia de los permisos y la disponibilidad del historial.',
      'La papelera no sustituye a un respaldo: un documento purgado se elimina físicamente. Ante una pérdida accidental, se debe restaurar desde la copia más reciente y documentar el incidente.',
    ],
  },
  'ana-notas-reunion': {
    title: 'Notas de reunión — seguimiento personal',
    paragraphs: [
      'Revisar el estado de los informes trimestrales y confirmar con el equipo las fechas de entrega. Preparar la lista de pendientes para la reunión de cierre.',
      'Actualizar la documentación de traspaso de la carpeta Personal y archivar los borradores que ya no se utilizan. Verificar que las comparticiones vigentes correspondan a personas activas.',
      'Reservar tiempo para la formación en el nuevo módulo de reportes y para revisar los indicadores de almacenamiento del trimestre.',
    ],
  },
  'ana-objetivos': {
    title: 'Objetivos personales 2026',
    paragraphs: [
      'Consolidar la estructura documental del área y reducir a la mitad el tiempo dedicado a localizar información. Mantener actualizados los manuales y las plantillas de uso frecuente.',
      'Participar en al menos dos capacitaciones técnicas durante el año y documentar los aprendizajes en una nota compartida con el equipo.',
      'Revisar mensualmente los permisos otorgados y cerrar los accesos que ya no sean necesarios. Mantener el historial de actividad como apoyo para las auditorías.',
    ],
  },
  'ana-readme': {
    title: 'Bienvenido al espacio de Ana Torres',
    paragraphs: [
      'Esta carpeta raíz reúne los documentos transversales que no pertenecen a un proyecto concreto. Los documentos de trabajo se organizan en las carpetas Proyectos, Documentación y Personal.',
      'Los archivos compartidos con otras áreas se marcan con un permiso explícito. Si necesita acceso a un documento, solicítelo al propietario; los administradores no pueden verlo sin autorización.',
      'Antes de crear una carpeta nueva, verifique que no exista una con el mismo propósito. Mantener una estructura simple facilita las búsquedas y la aplicación de permisos.',
    ],
  },
  'ana-borrador-articulo': {
    title: 'Borrador de artículo sobre gestión documental',
    paragraphs: [
      'La gestión documental no consiste únicamente en almacenar archivos, sino en definir reglas claras sobre quién puede consultar, modificar y eliminar cada recurso.',
      'Un repositorio sin estructura se convierte rápidamente en un depósito difícil de auditar. La combinación de carpetas jerárquicas, permisos explícitos e historial de actividad ofrece control sin sacrificar la colaboración.',
      'Este borrador quedó pendiente de revisión y fue enviado a la papelera al descartarse su publicación.',
    ],
  },
  'ana-borrador-discurso': {
    title: 'Borrador de discurso para la presentación interna',
    paragraphs: [
      'Buenos días. Hoy queremos compartir los avances del proyecto documental y agradecer la participación de todos los equipos durante la migración.',
      'La adopción del repositorio nos permitió ordenar la información y reducir el tiempo de búsqueda. Todavía quedan tareas de limpieza y de revisión de permisos que abordaremos en las próximas semanas.',
      'Este texto fue un borrador descartado y se conserva en la papelera como referencia histórica.',
    ],
  },
  'ana-notas-viejas': {
    title: 'Notas antiguas de coordinación',
    paragraphs: [
      'Lista de pendientes de la coordinación anterior: revisar inventario de material, actualizar contactos de proveedores y confirmar el calendario de vacaciones.',
      'La mayor parte de estas tareas ya fue reasignada. Se conserva el documento únicamente como referencia del periodo anterior.',
      'Documento archivado en la carpeta Archivo muerto y posteriormente enviado a la papelera junto con su carpeta contenedora.',
    ],
  },
  'ana-borrador-antiguo': {
    title: 'Borrador antiguo de propuesta',
    paragraphs: [
      'Propuesta inicial para reorganizar el archivo físico. Incluía un calendario de digitalización de seis meses y una estimación de costes por caja.',
      'El documento fue descartado porque el alcance cambió y la digitalización se contrató como servicio externo.',
      'Se eliminó de forma individual antes de que la carpeta contenedora pasara a la papelera, por lo que conserva su propia raíz de borrado.',
    ],
  },

  'luis-contrato-acme': {
    title: 'Contrato de servicios 2026 — Acme',
    paragraphs: [
      'El presente contrato regula la prestación de servicios de consultoría y soporte entre la empresa y Acme durante el ejercicio 2026. El acuerdo entra en vigor el 1 de enero y tiene una duración de doce meses, prorrogable por acuerdo escrito de las partes.',
      'El proveedor se compromete a entregar los informes mensuales de avance y a mantener un canal de atención para incidencias críticas. El cliente facilitará el acceso a la información necesaria y designará un responsable de validación.',
      'La facturación será mensual y se abonará dentro de los treinta días siguientes a la recepción de la factura. Cualquier cambio de alcance deberá formalizarse mediante anexo firmado por ambas partes.',
    ],
  },
  'luis-anexo-acme': {
    title: 'Anexo de servicios — Acme',
    paragraphs: [
      'Este anexo detalla los servicios incluidos en el contrato marco: soporte de primer nivel, revisión mensual de indicadores y elaboración de dos informes técnicos por trimestre.',
      'El horario de atención es de lunes a viernes de 8:00 a 18:00. Las incidencias críticas fuera de horario se atenderán según el procedimiento de guardia acordado.',
      'Los servicios adicionales se presupuestarán por separado y requerirán aprobación previa del responsable del cliente.',
    ],
  },
  'luis-nda-acme': {
    title: 'Acuerdo de confidencialidad — Acme',
    paragraphs: [
      'Las partes reconocen que la información intercambiada durante la relación comercial es confidencial y se comprometen a utilizarla exclusivamente para el desarrollo del proyecto.',
      'La obligación de confidencialidad se extiende a empleados y colaboradores con acceso a la información y se mantiene durante cinco años después de la finalización del acuerdo.',
      'Queda excluida la información de dominio público y aquella que deba revelarse por obligación legal, previa notificación a la otra parte cuando sea posible.',
    ],
  },
  'luis-propuesta-acme': {
    title: 'Propuesta comercial — Acme',
    paragraphs: [
      'La propuesta presenta un modelo de acompañamiento dividido en tres fases: diagnóstico, implantación y seguimiento. El objetivo es ordenar el repositorio documental y definir permisos por área.',
      'La fase de diagnóstico incluye entrevistas con los responsables y una revisión de la estructura actual. La implantación contempla la migración asistida y la capacitación de los usuarios clave.',
      'El presupuesto estimado es de 18.500 unidades e incluye tres meses de soporte posterior a la puesta en marcha. La validez de la oferta es de treinta días.',
    ],
  },
  'luis-contrato-globex': {
    title: 'Contrato de mantenimiento 2026 — Globex',
    paragraphs: [
      'El contrato cubre el mantenimiento correctivo y evolutivo de la plataforma interna de Globex. El equipo asignado atenderá las solicitudes según los niveles de servicio acordados.',
      'El tiempo máximo de respuesta para incidencias críticas es de dos horas laborables. Las mejoras de alcance mayor se planificarán en ciclos trimestrales y se presupuestarán por separado.',
      'El contrato se revisará anualmente. Cualquiera de las partes podrá solicitar una revisión extraordinaria con treinta días de antelación.',
    ],
  },
  'luis-propuesta-globex': {
    title: 'Propuesta de mejora — Globex',
    paragraphs: [
      'La propuesta identifica tres oportunidades de mejora: automatización de reportes, unificación de plantillas y revisión de la política de accesos.',
      'La automatización permitiría reducir el tiempo de elaboración de reportes en un 40 %. La unificación de plantillas facilitaría la comparación de resultados entre áreas.',
      'Se propone iniciar con un piloto de cuatro semanas en el área de operaciones y evaluar los resultados antes de extenderlo al resto de la organización.',
    ],
  },
  'luis-acta-globex': {
    title: 'Acta de reunión — Globex',
    paragraphs: [
      'Se revisaron las incidencias del último mes y el estado de las mejoras acordadas. Todas las incidencias críticas fueron resueltas dentro del plazo comprometido.',
      'Globex solicitó priorizar la automatización de reportes para el cierre de trimestre. El equipo confirmó la viabilidad y presentará un plan detallado en la próxima reunión.',
      'Se acordó mantener reuniones quincenales durante el periodo de implantación y volver a la frecuencia mensual una vez estabilizado el servicio.',
    ],
  },
  'luis-resumen-clientes': {
    title: 'Resumen de la cartera de clientes',
    paragraphs: [
      'La cartera activa está compuesta por Acme, Globex y otros cinco clientes de menor volumen. Acme y Globex concentran el 58 % de la facturación recurrente.',
      'Se identificaron dos renovaciones críticas para el primer trimestre y una oportunidad de ampliación de servicios en Globex. El seguimiento comercial se actualiza semanalmente.',
      'La documentación de cada cliente se mantiene en su carpeta correspondiente, con acceso restringido al equipo responsable y al área de administración.',
    ],
  },
  'luis-inventario-equipos': {
    title: 'Inventario de equipos informáticos',
    paragraphs: [
      'El inventario registra 46 equipos portátiles, 12 equipos de escritorio y 8 servidores. Cada equipo cuenta con número de serie, responsable y fecha de adquisición.',
      'Los equipos con más de cuatro años de antigüedad se revisan semestralmente para evaluar su reemplazo. Durante el último trimestre se sustituyeron cinco portátiles.',
      'Las bajas deben registrarse antes de retirar el equipo y borrar los datos de almacenamiento siguiendo el procedimiento de seguridad establecido.',
    ],
  },
  'luis-inventario-licencias': {
    title: 'Inventario de licencias de software',
    paragraphs: [
      'El inventario incluye las licencias ofimáticas, de diseño y de seguridad. Se revisa anualmente para evitar duplicidades y garantizar el cumplimiento de los acuerdos de uso.',
      'Existen 52 licencias ofimáticas asignadas y 6 disponibles en reserva. Las licencias de diseño se comparten por proyecto y se liberan al finalizar cada uno.',
      'Este documento fue enviado a la papelera tras la renovación del contrato de licencias y queda pendiente de purga definitiva.',
    ],
  },
  'luis-inventario-mobiliario': {
    title: 'Inventario de mobiliario de oficina',
    paragraphs: [
      'El mobiliario se distribuye entre las sedes central y norte. El inventario incluye escritorios, sillas ergonómicas, armarios y equipamiento de salas de reunión.',
      'Las altas y bajas se registran con la fecha de movimiento y el responsable de la sede. Los elementos dañados se marcan para reparación o retirada.',
      'La revisión física se realiza cada seis meses y se contrasta con el registro administrativo para detectar diferencias.',
    ],
  },
  'luis-inventario-software': {
    title: 'Inventario de software instalado',
    paragraphs: [
      'El documento recoge las versiones autorizadas de las aplicaciones utilizadas por el equipo, junto con su responsable y el canal de soporte.',
      'Se recomienda actualizar las herramientas de forma planificada y mantener una copia de configuración antes de cada cambio mayor. Las versiones fuera de soporte deben sustituirse.',
      'Las instalaciones no autorizadas se notifican al área de seguridad para su revisión.',
    ],
  },
  'luis-lista-proveedores': {
    title: 'Lista de proveedores homologados',
    paragraphs: [
      'La lista incluye proveedores de servicios profesionales, tecnología, suministros y mantenimiento. Cada registro indica el contacto principal, el estado de homologación y la fecha de la última evaluación.',
      'Solo los proveedores homologados pueden recibir pedidos. Las excepciones requieren autorización de administración y deben regularizarse en un plazo máximo de treinta días.',
      'La evaluación anual considera calidad, cumplimiento de plazos y condiciones comerciales. Los resultados se documentan y se comparten con el área solicitante.',
    ],
  },
  'luis-evaluacion-proveedores': {
    title: 'Evaluación anual de proveedores',
    paragraphs: [
      'Se evaluaron 18 proveedores con actividad durante el último año. El 78 % obtuvo una calificación satisfactoria y tres requieren un plan de mejora.',
      'Los criterios con mayor peso fueron el cumplimiento de plazos y la calidad del servicio. Las incidencias recurrentes se trataron en reuniones específicas con cada proveedor.',
      'El plan de mejora incluye objetivos medibles y una revisión a los tres meses. Si no se alcanzan los resultados, se iniciará el proceso de baja.',
    ],
  },
  'luis-procedimiento-compras': {
    title: 'Procedimiento de compras',
    paragraphs: [
      'Toda compra debe originarse en una solicitud aprobada por el responsable del área. La solicitud indica justificación, importe estimado y fecha requerida.',
      'Administración valida la disponibilidad presupuestaria y solicita al menos dos ofertas para importes superiores a 2.000 unidades. La adjudicación se comunica por escrito.',
      'La recepción se registra con la conformidad del solicitante. Las facturas se archivan en la carpeta del proveedor y se vinculan al pedido correspondiente.',
    ],
  },
  'luis-pendientes': {
    title: 'Pendientes del área de operaciones',
    paragraphs: [
      'Lista de tareas abiertas: actualizar el inventario de licencias, revisar la evaluación anual de proveedores y confirmar las fechas de entrega con Globex.',
      'Cada pendiente debe tener un responsable y una fecha límite. Los acuerdos se revisan en la reunión semanal y se documentan en el acta correspondiente.',
      'Este archivo vive en la raíz del usuario porque es transversal a todas las carpetas de operaciones.',
    ],
  },
  'luis-borrador-propuesta': {
    title: 'Borrador de propuesta para nuevo cliente',
    paragraphs: [
      'La propuesta preliminar planteaba un servicio de digitalización y catalogación de expedientes con un plazo de ocho semanas.',
      'El cliente solicitó finalmente un alcance más reducido y el borrador se descartó. Se conserva únicamente como referencia.',
      'Este documento se encuentra en la papelera junto con la carpeta Temporal, que fue eliminada en cascada.',
    ],
  },
  'luis-notas-vieja': {
    title: 'Notas de reunión antiguas',
    paragraphs: [
      'Reunión de coordinación del trimestre anterior. Se revisaron pendientes de inventario y se acordó actualizar la lista de contactos de proveedores.',
      'La mayoría de los acuerdos ya fueron ejecutados o reasignados. El documento no tiene vigencia actual.',
      'Forma parte del contenido eliminado junto con la carpeta Temporal.',
    ],
  },
  'luis-temporal': {
    title: 'Documento temporal de trabajo',
    paragraphs: [
      'Notas temporales utilizadas durante la migración de datos. Incluyen comprobaciones de nombres duplicados y recordatorios de revisión.',
      'El contenido quedó obsoleto al completarse la migración y se envió a la papelera junto con su carpeta contenedora.',
      'Se mantiene en la papelera hasta que el propietario decida restaurarlo o purgarlo definitivamente.',
    ],
  },

  'admin-politica-usuarios': {
    title: 'Política de gestión de usuarios',
    paragraphs: [
      'Cada usuario debe contar con una cuenta individual identificada por correo electrónico. No se permite compartir credenciales ni crear cuentas genéricas para uso personal.',
      'Los permisos se asignan por recurso y se revisan periódicamente. Al desactivar una cuenta se conservan sus documentos e historial para no romper la trazabilidad.',
      'Las altas y bajas se registran en el historial de actividad. La contraseña debe cambiarse ante cualquier indicio de compromiso de la cuenta.',
    ],
  },
  'admin-registro-altas': {
    title: 'Registro de altas de usuarios',
    paragraphs: [
      'El registro recoge la fecha de alta, el correo, el rol asignado y el responsable de la solicitud. Las altas con rol de administrador requieren doble validación.',
      'Las cuentas permanecen inactivas hasta que el usuario confirma el acceso. Las cuentas sin actividad durante un año se revisan antes de su desactivación.',
      'Este registro complementa el historial del sistema y no lo sustituye. Los eventos de creación y desactivación quedan auditados automáticamente.',
    ],
  },
  'admin-reporte-octubre': {
    title: 'Reporte de actividad — octubre 2026',
    paragraphs: [
      'Durante octubre se registraron 50 archivos activos y 24 carpetas distribuidas entre tres usuarios. El almacenamiento total se mantuvo por debajo del 10 % de la capacidad prevista.',
      'Las acciones más frecuentes fueron la subida de archivos, la creación de carpetas y la concesión de permisos. La actividad se concentró en los días laborables.',
      'Se recomienda revisar las comparticiones con nivel EDIT y confirmar que siguen siendo necesarias. También conviene purgar los recursos de la papelera que ya no aportan valor.',
    ],
  },
  'admin-reporte-septiembre': {
    title: 'Reporte de actividad — septiembre 2026',
    paragraphs: [
      'Septiembre cerró con un incremento del 12 % en documentos creados respecto al mes anterior. La mayor parte de la actividad correspondió al área de proyectos.',
      'No se detectaron accesos anómalos. Las descargas se registraron correctamente y los permisos concedidos coinciden con las solicitudes documentadas.',
      'El reporte fue reemplazado por la versión de octubre y se envió a la papelera como parte de la limpieza mensual.',
    ],
  },
  'admin-plantilla-informe': {
    title: 'Plantilla de informe trimestral',
    paragraphs: [
      'El informe debe incluir un resumen ejecutivo, los indicadores del periodo, las desviaciones detectadas y las acciones previstas para el siguiente trimestre.',
      'Cada sección debe ser breve y estar respaldada por datos verificables. Las cifras se presentan en tablas y se indica la fuente de cada una.',
      'La versión final se revisa antes de su publicación y se conserva en la carpeta del proyecto correspondiente.',
    ],
  },
  'admin-plantilla-acta': {
    title: 'Plantilla de acta de reunión',
    paragraphs: [
      'El acta registra fecha, participantes, temas tratados, acuerdos y responsables. Cada acuerdo debe tener una fecha de seguimiento.',
      'El documento se comparte con los participantes en un plazo máximo de 48 horas. Las correcciones se incorporan como una nueva versión.',
      'Las actas se archivan en la carpeta del proyecto y se referencian desde el informe de avance cuando corresponda.',
    ],
  },
  'admin-plantilla-correo': {
    title: 'Plantilla de comunicación interna',
    paragraphs: [
      'Asunto: [Área] — [Tema] — [Fecha]. El mensaje debe comenzar con el objetivo y continuar con los puntos concretos que requieren acción.',
      'Se recomienda usar listas para los pendientes e indicar responsable y fecha límite en cada uno. Evite incluir información confidencial innecesaria.',
      'Cierre con un resumen de próximos pasos y el canal de contacto para dudas.',
    ],
  },
  'admin-procedimiento-admin': {
    title: 'Procedimiento de administración del sistema',
    paragraphs: [
      'El administrador gestiona usuarios, revisa reportes globales y verifica la coherencia de los datos. No accede al contenido de los documentos sin una compartición explícita.',
      'Las tareas periódicas incluyen revisar el almacenamiento por usuario, comprobar la papelera y verificar que las comparticiones siguen vigentes.',
      'Ante un incidente, se documenta la fecha, el alcance y las acciones realizadas. El historial de actividad es la fuente principal para la investigación.',
    ],
  },
};
