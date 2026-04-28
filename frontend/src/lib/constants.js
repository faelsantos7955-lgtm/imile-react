// Constantes compartilhadas entre Contestacoes.jsx e ContestacoesPublico.jsx
// Deve estar sincronizado com os valores em backend/api/routes/contestacoes.py

export const MOTIVOS = ['Avaria', 'Extravio', 'Fake Delivery', 'Fake POD']

export const STATUS_OPTIONS = [
  'Pendente',
  'Em Análise',
  'Em Andamento',
  'Enviado ao Financeiro',
  'Atraso do Financeiro',
  'Aprovado',
  'Reprovado',
]

export const DS_LIST = [
  'DS BJP','DS SJC','DS CTT','DS UBT','DS GRT','DS SCP','DS TBT','DS CZR','DS MSL','DS ILB',
  'DS CPJ','DS PMB','DS PDR','DS SCM','CSP01D','CSP02D','DS TPR','DS NOV','DS PIX','DS PIB',
  'DS CPQ','DS CPX','DS IND','DS IDT','DS MCC','DS MGN','DS AMR','DS LIM','DS SP003C','DS SO004C',
  'DS SP005C','DS SP007C','DS AAR','DS SLT','DS VLM','DS AAC','DS JDP','DS BLV','DS PSC','DS LBD',
  'DS MBI','DS GRUI','DS GUL','DS IPR','DS CBL','DS GJU','DS GAU','DS PAR','DS SBB','DS CSA',
  'DS GTS','DS JIR','DS VRE','DS FRZ','DS MOG','DS ARJ','DS IQQ','DS RCA','DS GNZ','DS SPO',
  'DS SPL','DS MGI','DS MGZ','DS SUZ','DS FVC','DS BAR','DS CTI','DS ITE','DS SRQ','DS VAR',
  'DS CPB','DS BIU','DS JDA','DS BER','DS JST','DS PNM','DS GUA','DS STL','DS SAM','DS VLL',
  'DS MTS','DS VLB','DS SVL','DS PLO','DS GLH','DS GHO','DS JDS','DS SP001C','DS SP002C','DS JVC',
  'DS VLN','DS TAMI','DS JMC','DS JSL','DS PRP','DS EBG','DS ITC','DS PQR','DS CIR - BACKUP','DS JDM',
  'DS EAR','DS JER','DS CRP','DS JMI - BACKUP CRP,PQR','DS PQP','DS WSC','DS ELM','DS VGI','DS CDR','DS BCC',
  'DS TAS','DS VAN','DS SVM','DS JOL','DS MRA','DS OUR','DS SJP','DS ARU','DS AIF','DS JAU',
  'DS PSD','DS BUR','DS BUXI','DS CTD','DS AVR','DS VOT','DS BRT','DS UAJ','DS JAL','DS ADD',
  'DS SFS','DS JBC','DS FRC','DS RPT','DS PSS','DS SCL','DS AQR','DS VGL','DS RRA','DS BAT',
  'DS MAT','DS SCO BACKUP SCL','DS ORL','DS SVT','DS LSV','DS VDR','DS SBC','DS SBA','DS DDM','DS STD',
  'DS AET','DS MAU','DS JUD','DS MAI','DS ING','DS SRO','DS SCB','DS TAI','DS VTT','DS FCR',
]
