// Service de geração de exercícios.
// Modos: Cartões clássicos, Verdadeiro/Falso, Jogo da memória, Combinar
// pares, Relacionar imagem, Revisão, e agora Escrever (dado a definição
// ou dado o áudio).

import { prisma } from '../config/database.js'

const sortear = (lista) => lista[Math.floor(Math.random() * lista.length)]

const embaralhar = (lista) => {
  const copia = [...lista]
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
  }
  return copia
}

// Normaliza texto pra comparação: remove acentos, ignora maiúscula/minúscula
// e espaços nas pontas. Não trata sinônimos (ex: "big" vs "large" continua
// contando como errado) — isso é uma limitação conhecida e documentada.
const normalizarTexto = (texto) => {
  return texto
    .normalize('NFD') // separa a letra do acento (ex: "á" vira "a" + acento)
    .replace(/[\u0300-\u036f]/g, '') // remove os acentos separados
    .toLowerCase()
    .trim()
}

const buscarDeckComFlashcards = async (deckId, ownerId, nivel = null) => {
  const deck = await prisma.deck.findFirst({
    where: { id: Number(deckId), ownerId },
    include: { flashcards: nivel ? { where: { nivel } } : true },
  })
  if (!deck) {
    throw new Error('Deck não encontrado')
  }
  return deck
}

export const exercicioService = {
  gerarCartoesClassicos: async (deckId, ownerId, nivel = null) => {
    const deck = await buscarDeckComFlashcards(deckId, ownerId, nivel)
    if (deck.flashcards.length === 0) throw new Error('O deck não tem flashcards')
    const cartoes = embaralhar(deck.flashcards).map((c) => ({
      flashcardId: c.id, front: c.front, back: c.back, nivel: c.nivel, imagemUrl: c.imagemUrl,
    }))
    return { deckId: deck.id, cartoes }
  },

  gerarVerdadeiroFalso: async (deckId, ownerId, nivel = null) => {
    const deck = await buscarDeckComFlashcards(deckId, ownerId, nivel)
    if (deck.flashcards.length < 2) {
      throw new Error(nivel ? `O deck não tem flashcards suficientes no nível ${nivel}` : 'O deck precisa ter pelo menos 2 flashcards para gerar Verdadeiro ou Falso')
    }
    const cardBase = sortear(deck.flashcards)
    const ehVerdadeiro = Math.random() < 0.5
    let backMostrado = cardBase.back
    if (!ehVerdadeiro) {
      const outros = deck.flashcards.filter((c) => c.id !== cardBase.id)
      backMostrado = sortear(outros).back
    }
    return {
      deckId: deck.id, flashcardId: cardBase.id, front: cardBase.front,
      imagemUrl: cardBase.imagemUrl || null, backMostrado, correto: ehVerdadeiro, nivel: cardBase.nivel,
    }
  },

  gerarJogoDaMemoria: async (deckId, ownerId, quantidade = 6) => {
    const deck = await buscarDeckComFlashcards(deckId, ownerId)
    if (deck.flashcards.length < 2) throw new Error('O deck precisa ter pelo menos 2 flashcards para o jogo da memória')
    const qtd = Math.min(Number(quantidade) || 6, deck.flashcards.length)
    const selecionados = embaralhar(deck.flashcards).slice(0, qtd)
    const cartas = []
    selecionados.forEach((card) => {
      cartas.push({ parId: card.id, flashcardId: card.id, tipo: 'front', texto: card.front })
      cartas.push({ parId: card.id, flashcardId: card.id, tipo: 'back', texto: card.back })
    })
    return { deckId: deck.id, cartas: embaralhar(cartas) }
  },

  gerarCombinarPares: async (deckId, ownerId, quantidade = 6) => {
    const deck = await buscarDeckComFlashcards(deckId, ownerId)
    if (deck.flashcards.length < 2) throw new Error('O deck precisa ter pelo menos 2 flashcards para combinar pares')
    const qtd = Math.min(Number(quantidade) || 6, deck.flashcards.length)
    const selecionados = embaralhar(deck.flashcards).slice(0, qtd)
    const pares = embaralhar(selecionados.map((c) => ({ flashcardId: c.id, palavra: c.front })))
    const definicoes = embaralhar(selecionados.map((c) => ({ flashcardId: c.id, definicao: c.back })))
    return { deckId: deck.id, pares, definicoes }
  },

  gerarRelacionarImagem: async (deckId, ownerId, quantidade = 6) => {
    const deck = await prisma.deck.findFirst({
      where: { id: Number(deckId), ownerId },
      include: { flashcards: { where: { imagemUrl: { not: null } } } },
    })
    if (!deck) throw new Error('Deck não encontrado')
    if (deck.flashcards.length < 2) throw new Error('Esse deck precisa de pelo menos 2 flashcards com imagem cadastrada (campo imagemUrl) para gerar esse exercício')
    const qtd = Math.min(Number(quantidade) || 6, deck.flashcards.length)
    const selecionados = embaralhar(deck.flashcards).slice(0, qtd)
    const palavras = embaralhar(selecionados.map((c) => ({ flashcardId: c.id, palavra: c.front })))
    const imagens = embaralhar(selecionados.map((c) => ({ flashcardId: c.id, imagemUrl: c.imagemUrl })))
    return { deckId: deck.id, palavras, imagens }
  },

  gerarRevisao: async (userId, deckId = null) => {
    const respostas = await prisma.respostaFlashcard.findMany({
      where: { userId, ...(deckId ? { flashcard: { deckId: Number(deckId) } } : {}) },
      include: { flashcard: true },
      orderBy: { respondidoEm: 'desc' },
    })
    const ultimaRespostaPorFlashcard = new Map()
    for (const r of respostas) {
      if (!ultimaRespostaPorFlashcard.has(r.flashcardId)) ultimaRespostaPorFlashcard.set(r.flashcardId, r)
    }
    const flashcardsParaRevisar = [...ultimaRespostaPorFlashcard.values()].filter((r) => !r.acertou).map((r) => r.flashcard)
    if (flashcardsParaRevisar.length === 0) {
      throw new Error('Não há palavras para revisar no momento — continue assim! 🎉')
    }
    const cardBase = sortear(flashcardsParaRevisar)
    let ehVerdadeiro = Math.random() < 0.5
    let backMostrado = cardBase.back
    if (!ehVerdadeiro) {
      let candidatos = flashcardsParaRevisar.filter((c) => c.id !== cardBase.id)
      if (candidatos.length === 0) {
        candidatos = await prisma.flashcard.findMany({ where: { deckId: cardBase.deckId, id: { not: cardBase.id } } })
      }
      if (candidatos.length > 0) {
        backMostrado = sortear(candidatos).back
      } else {
        ehVerdadeiro = true
      }
    }
    return {
      flashcardId: cardBase.id, deckId: cardBase.deckId, front: cardBase.front,
      imagemUrl: cardBase.imagemUrl || null, backMostrado, correto: ehVerdadeiro,
      totalPalavrasParaRevisar: flashcardsParaRevisar.length,
    }
  },

  // ------------------------------------------------------------
  // NOVO: Escrever dado a definição
  // Mostra o "back" (definição em pt-BR) e esconde o "front" — o aluno
  // digita a palavra na língua alvo. NÃO devolve o front na resposta,
  // pra não entregar a resposta de graça.
  // ------------------------------------------------------------
  gerarEscreverDefinicao: async (deckId, ownerId, nivel = null) => {
    const deck = await buscarDeckComFlashcards(deckId, ownerId, nivel)
    if (deck.flashcards.length === 0) {
      throw new Error(nivel ? `O deck não tem flashcards no nível ${nivel}` : 'O deck não tem flashcards')
    }
    const card = sortear(deck.flashcards)
    return {
      flashcardId: card.id,
      deckId: deck.id,
      definicao: card.back, // o que aparece na tela pro aluno ler
      nivel: card.nivel,
    }
  },

  // ------------------------------------------------------------
  // NOVO: Escrever dado o áudio
  // Devolve o "front" (pra o frontend usar no texto-pra-voz) — o aluno
  // OUVE a pronúncia e digita a palavra na língua alvo. O front aqui
  // não é "escondido" porque ele é necessário pro navegador falar a
  // palavra; a tela não deve mostrar esse texto, só usar pra voz.
  // ------------------------------------------------------------
  gerarEscreverAudio: async (deckId, ownerId, nivel = null) => {
    const deck = await buscarDeckComFlashcards(deckId, ownerId, nivel)
    if (deck.flashcards.length === 0) {
      throw new Error(nivel ? `O deck não tem flashcards no nível ${nivel}` : 'O deck não tem flashcards')
    }
    const card = sortear(deck.flashcards)
    return {
      flashcardId: card.id,
      deckId: deck.id,
      textoParaFalar: card.front, // o frontend usa isso só pra chamar o texto-pra-voz, não deve exibir na tela
      nivel: card.nivel,
    }
  },

  // ------------------------------------------------------------
  // NOVO: Verifica a resposta digitada pelo aluno (usado pelos dois
  // modos de "escrever" acima). Compara com o "front" do flashcard,
  // ignorando acento e maiúscula/minúscula. NÃO aceita sinônimos.
  // ------------------------------------------------------------
  verificarResposta: async (flashcardId, respostaDigitada, ownerId) => {
    const flashcard = await prisma.flashcard.findUnique({
      where: { id: Number(flashcardId) },
      include: { deck: true },
    })

    if (!flashcard || flashcard.deck.ownerId !== ownerId) {
      throw new Error('Flashcard não encontrado')
    }

    const correto = normalizarTexto(respostaDigitada || '') === normalizarTexto(flashcard.front)

    return {
      flashcardId: flashcard.id,
      correto,
      respostaCorreta: flashcard.front, // revela a resposta certa, mesmo se acertou (bom pra aprendizado)
    }
  },
}
