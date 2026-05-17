// ai-config.js - AI Chat System with Multi-language Support (Darija, Arabic, French, English)

class AIConfig {
    constructor() {
        this.conversationHistory = new Map();
        this.userLanguage = new Map();
        
        // Darija (Moroccan Arabic) responses
        this.darijaResponses = {
            greetings: [
                "🎉 Salamou 3likom! Labas? Kifach n3awnek lyoum? 😊",
                "✨ Ahlan! Labas 3lik? Chno baghi t9oul?",
                "🤗 Salam! Kidayr? Nta baghi tsewwel 3la 7aja?",
                "🌙 Labas? Hna nsaa3dek f had lw9t!"
            ],
            howAreYou: [
                "🤗 Lhamdullah, mzyan! Nta kidayr?",
                "😊 Mzyan, chokran! Nta labas?",
                "👍 Koulchi mzyan! Kifash n3awnek?"
            ],
            thanks: [
                "🥰 L3afou! Mzyan nsaa3dek.",
                "💖 Hna lil wqtek! Nta tb9a f lkhir.",
                "😊 Chokran bzzaf! T3ayt lya f waqt okhr."
            ],
            askQuestion: [
                "💡 Hado su'al mzyan! Wach baghi t'aref 3la haga mzyana?",
                "🤔 Su'al mezyan. Khassek t'aref had lhaja bntiqa...",
                "📚 Hado su'al zwina! Nshreh lik b tafsir?"
            ],
            compliment: [
                "😊 Chokran bzzaf! Nta lemezyan f lwqat.",
                "🥰 L3ziza 3liya had lklamat! Chno baghi t'aref?"
            ],
            why: [
                "🤔 3lach? Hado su'al mezyan. Khassek t'aref had lhaja...",
                "💡 3lach? Hna nshre7 lik b lma'qoul..."
            ],
            default: [
                "🌙 Salam! Ana hna n3awenek. Wach tahder 3la haja mo3ayena?",
                "🤖 Ana Hna! Chno baghi t'sali lyoum?",
                "💬 Salam! Qolli chno mochkiltek w n3awnek."
            ]
        };
        
        // Arabic responses
        this.arabicResponses = {
            greetings: [
                "✨ وعليكم السلام ورحمة الله! كيف أقدر أساعدك اليوم؟",
                "🌙 أهلاً وسهلاً! كيف يمكنني خدمتك؟",
                "🤗 مرحباً! كيف حالك؟"
            ],
            howAreYou: [
                "🤗 الحمد لله بخير! شكراً للسؤال. كيف أقدر أخدمك؟",
                "😊 بخير، شكراً! وأنت كيف حالك؟"
            ],
            thanks: [
                "💖 عفواً! سعيد بمساعدتك.",
                "🥰 على الرحب والسعة! هل تريد شيئاً آخر؟"
            ],
            askQuestion: [
                "💡 سؤال رائع! دعني أفكر في هذا.",
                "📚 سؤال جميل! كيف يمكنني مساعدتك بشكل أفضل؟"
            ],
            default: [
                "🌙 مرحباً! أنا هنا للمساعدة. ماذا تريد أن تعرف اليوم؟",
                "🤖 أنا المساعد الذكي! كيف يمكنني خدمتك؟"
            ]
        };
        
        // French responses
        this.frenchResponses = {
            greetings: [
                "✨ Bonjour! Comment puis-je vous aider aujourd'hui?",
                "🌙 Salut! Comment ca va aujourd'hui?",
                "🤗 Bonjour! En quoi puis-je vous etre utile?"
            ],
            howAreYou: [
                "🤗 Tres bien, merci! Et vous? Comment puis-je vous assister?",
                "😊 Bien, merci! Comment allez-vous?"
            ],
            thanks: [
                "💖 Avec plaisir! N'hesitez pas si vous avez d'autres questions.",
                "🥰 Je vous en prie! Heureux d'avoir pu aider."
            ],
            askQuestion: [
                "💡 Excellente question! Laissez-moi reflechir.",
                "📚 Bonne question! Je vais vous aider avec ca."
            ],
            default: [
                "🌙 Bonjour! Je suis la pour vous aider. De quoi avez-vous besoin aujourd'hui?",
                "🤖 Salut! Je suis votre assistant IA. Comment puis-je vous aider?"
            ]
        };
        
        // English responses
        this.englishResponses = {
            greetings: [
                "✨ Hello there! How can I help you today? 😊",
                "🌙 Hi! How's your day going?",
                "🤗 Hey there! What can I do for you?"
            ],
            howAreYou: [
                "🤗 I'm doing great, thanks for asking! How about you?",
                "😊 I'm wonderful! How can I assist you today?"
            ],
            thanks: [
                "💖 You're very welcome! Happy to help anytime!",
                "🥰 My pleasure! Let me know if you need anything else."
            ],
            askQuestion: [
                "💡 Great question! Let me think about that.",
                "📚 That's an excellent question! Here's what I think..."
            ],
            why: [
                "🤔 That's an interesting question! Let me explain...",
                "💡 Good question! Here's why..."
            ],
            default: [
                "🌙 Hi there! I'm your AI assistant. What would you like to talk about?",
                "🤖 Hello! I'm here to help. What's on your mind today?"
            ]
        };
    }

    detectLanguage(text) {
        const lowercaseText = text.toLowerCase();
        
        // Darija detection (Moroccan Arabic)
        const darijaWords = ['salam', 'labas', 'wakha', 'ila', '3lach', 'hna', 'daba', 'bzzaf', 'shwiya', 'mzyan', 'kidayr', 'baghi', 'chno', 'wach', 'ash', 't9wd', 'ry7', 'bhal', 'm3a', '3ndi', '9rib', 'b3id', 'ah', 'la'];
        let darijaCount = 0;
        for (const word of darijaWords) {
            if (lowercaseText.includes(word)) darijaCount++;
        }
        if (darijaCount >= 1) return 'darija';
        
        // Arabic detection
        const arabicPattern = /[\u0600-\u06FF]/;
        if (arabicPattern.test(text)) return 'arabic';
        
        // French detection
        const frenchWords = ['bonjour', 'salut', 'comment', 'merci', 'ca va', 'bien', 'tres', 'pourquoi', 'quoi', 'oui', 'non', 'ami', 'maison'];
        let frenchCount = 0;
        for (const word of frenchWords) {
            if (lowercaseText.includes(word)) frenchCount++;
        }
        if (frenchCount >= 1) return 'french';
        
        // Default English
        return 'english';
    }

    getRandomResponse(responses) {
        return responses[Math.floor(Math.random() * responses.length)];
    }

    generateResponse(question, userId) {
        try {
            // Get or detect language
            let language = this.userLanguage.get(userId);
            if (!language) {
                language = this.detectLanguage(question);
                this.userLanguage.set(userId, language);
                
                // Reset after 30 minutes of inactivity
                setTimeout(() => {
                    if (this.userLanguage.get(userId) === language) {
                        this.userLanguage.delete(userId);
                        this.conversationHistory.delete(userId);
                    }
                }, 1800000);
            }
            
            const lowerQuestion = question.toLowerCase();
            let response = "";
            
            // Language-specific response generation
            switch(language) {
                case 'darija':
                    if (lowerQuestion.includes('salam') || lowerQuestion.includes('ahlan') || lowerQuestion.includes('labas') || lowerQuestion.includes('marhaba')) {
                        response = this.getRandomResponse(this.darijaResponses.greetings);
                    } else if (lowerQuestion.includes('kifash') || lowerQuestion.includes('kif') || lowerQuestion.includes('kidayr') || lowerQuestion.includes('labas')) {
                        response = this.getRandomResponse(this.darijaResponses.howAreYou);
                    } else if (lowerQuestion.includes('shukran') || lowerQuestion.includes('merci') || lowerQuestion.includes('chokran')) {
                        response = this.getRandomResponse(this.darijaResponses.thanks);
                    } else if (lowerQuestion.includes('wach') || lowerQuestion.includes('ash') || lowerQuestion.includes('chno') || lowerQuestion.includes('chhal')) {
                        response = this.getRandomResponse(this.darijaResponses.askQuestion);
                    } else if (lowerQuestion.includes('7elwa') || lowerQuestion.includes('zwin') || lowerQuestion.includes('mzyan')) {
                        response = this.getRandomResponse(this.darijaResponses.compliment);
                    } else if (lowerQuestion.includes('3lach') || lowerQuestion.includes('lach')) {
                        response = this.getRandomResponse(this.darijaResponses.why);
                    } else {
                        response = this.getRandomResponse(this.darijaResponses.default);
                    }
                    break;
                    
                case 'arabic':
                    if (lowerQuestion.includes('السلام') || lowerQuestion.includes('اهلا') || lowerQuestion.includes('مرحبا')) {
                        response = this.getRandomResponse(this.arabicResponses.greetings);
                    } else if (lowerQuestion.includes('كيف') || lowerQuestion.includes('حالك')) {
                        response = this.getRandomResponse(this.arabicResponses.howAreYou);
                    } else if (lowerQuestion.includes('شكر') || lowerQuestion.includes('مشكور')) {
                        response = this.getRandomResponse(this.arabicResponses.thanks);
                    } else if (lowerQuestion.includes('ماذا') || lowerQuestion.includes('ايش') || lowerQuestion.includes('شنو')) {
                        response = this.getRandomResponse(this.arabicResponses.askQuestion);
                    } else {
                        response = this.getRandomResponse(this.arabicResponses.default);
                    }
                    break;
                    
                case 'french':
                    if (lowerQuestion.includes('bonjour') || lowerQuestion.includes('salut')) {
                        response = this.getRandomResponse(this.frenchResponses.greetings);
                    } else if (lowerQuestion.includes('comment') || lowerQuestion.includes('ca va')) {
                        response = this.getRandomResponse(this.frenchResponses.howAreYou);
                    } else if (lowerQuestion.includes('merci')) {
                        response = this.getRandomResponse(this.frenchResponses.thanks);
                    } else if (lowerQuestion.includes('quoi') || lowerQuestion.includes('pourquoi')) {
                        response = this.getRandomResponse(this.frenchResponses.askQuestion);
                    } else {
                        response = this.getRandomResponse(this.frenchResponses.default);
                    }
                    break;
                    
                default: // English
                    if (lowerQuestion.includes('hello') || lowerQuestion.includes('hi') || lowerQuestion.includes('hey')) {
                        response = this.getRandomResponse(this.englishResponses.greetings);
                    } else if (lowerQuestion.includes('how are you') || lowerQuestion.includes('how do you do')) {
                        response = this.getRandomResponse(this.englishResponses.howAreYou);
                    } else if (lowerQuestion.includes('thank') || lowerQuestion.includes('thanks')) {
                        response = this.getRandomResponse(this.englishResponses.thanks);
                    } else if (lowerQuestion.includes('what') || lowerQuestion.includes('why') || lowerQuestion.includes('how') || lowerQuestion.includes('when')) {
                        response = this.getRandomResponse(this.englishResponses.askQuestion);
                    } else {
                        response = this.getRandomResponse(this.englishResponses.default);
                    }
                    break;
            }
            
            // Store conversation history (keep last 5 exchanges)
            let history = this.conversationHistory.get(userId) || [];
            history.push({ user: question, assistant: response });
            if (history.length > 5) history = history.slice(-5);
            this.conversationHistory.set(userId, history);
            
            return response;
            
        } catch (error) {
            console.error('AI Response Error:', error);
            return "❌ Sorry, I encountered an error. Please try again.";
        }
    }

    getStats() {
        return {
            activeUsers: this.conversationHistory.size,
            languages: {
                darija: Array.from(this.userLanguage.values()).filter(l => l === 'darija').length,
                arabic: Array.from(this.userLanguage.values()).filter(l => l === 'arabic').length,
                french: Array.from(this.userLanguage.values()).filter(l => l === 'french').length,
                english: Array.from(this.userLanguage.values()).filter(l => l === 'english').length
            }
        };
    }
}

module.exports = AIConfig;
