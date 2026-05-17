// ai-config.js - AI Chat Configuration with Multi-language Support
// This file handles AI responses using a lightweight API approach

class AIConfig {
    constructor() {
        // Language detection patterns for Darija and other languages
        this.languagePatterns = {
            darija: {
                keywords: ['hna', 'daba', 'bzzaf', 'shwiya', 'mzyan', 'wakha', 'ila', 'fhamt', '3lach', 'ana', 'nta', 'nti', 'hadi', 'hadak', 'rah', 'kayn', 'makan', 'ma3ndi', 't9wd', 'ry7', 'bhal', 'm3a', 'mn', 'f', '3la', 'lia', 'lik', '3ndi', 'baghi', 'bgheet', 'mchi', 'mshit', 'klina', 'kol', 'chrab', 'n3as', '3yit', 's7ab', 's7abi', '7b', '7bib', 'zwin', 'zwina', '7elou', '7elwa', '9rib', 'b3id', 'la', 'ah', 'wakha', 'hada', 'hadchi', 'hadok', 'dik', 'dak'],
                greeting: /(salam|ahlan|marhaba|labas|labass|labas 3lik|labas 3likom)/i,
                question: /(ash|ach|achno|chno|wach|chhal|chkoun|chmen|ali|3lach|imta|ftach)/i
            },
            arabic: {
                keywords: /[\u0600-\u06FF]/,
                greeting: /(السلام عليكم|اهلا|مرحبا|صباح الخير|مساء الخير)/i,
                question: /(ما|ماذا|لماذا|كيف|أين|متى|من|هل)/i
            },
            french: {
                keywords: /(bonjour|merci|comment|pourquoi|oui|non|très|bien|mal|ami|maison|voiture|jour|nuit|salut|ça va|au revoir|s'il vous plaît|je suis|tu es|il est|elle est|nous sommes|vous êtes|parler|discuter|aide|besoin|problème|erreur|travail|maison|école|voiture|chien|chat)/i,
                greeting: /(salut|bonjour|coucou|hello|hey|yo)/i,
                question: /(quoi|pourquoi|comment|quand|où|qui|quel|quelle|est-ce que)/i
            },
            english: {
                keywords: /(hello|hi|how|what|why|where|when|who|which|yes|no|good|bad|nice|great|awesome|terrible|love|hate|like|dislike|please|thank|sorry|help|need|want|can|could|would|should|maybe|perhaps|definitely|absolutely|totally|very|really|quite|rather|some|any|many|much|more|most|few|several|both|each|every|all|some|any|no|none)/i,
                greeting: /(hi|hello|hey|yo|sup|what's up|howdy|greetings)/i,
                question: /(what|why|how|when|where|who|which|is|are|am|do|does|did|can|could|would|should|will)/i
            }
        };
        
        this.conversationHistory = new Map();
        this.userLanguage = new Map();
    }

    detectLanguage(text) {
        const lowercaseText = text.toLowerCase();
        
        // Check for Darija first (most important)
        const darijaMatches = this.languagePatterns.darija.keywords.filter(word => 
            lowercaseText.includes(word)
        ).length;
        
        if (darijaMatches >= 1) {
            return 'darija';
        }
        
        if (this.languagePatterns.darija.greeting.test(text)) {
            return 'darija';
        }
        
        // Check for Arabic script
        if (this.languagePatterns.arabic.keywords.test(text)) {
            return 'arabic';
        }
        
        // Check for French
        let frenchMatches = 0;
        const frenchKeywords = this.languagePatterns.french.keywords.toString().match(/[a-zàâçéèêëîïôûùüÿæœ]+/gi) || [];
        frenchKeywords.forEach(word => {
            if (lowercaseText.includes(word.toLowerCase())) frenchMatches++;
        });
        
        if (frenchMatches >= 2 || this.languagePatterns.french.greeting.test(text)) {
            return 'french';
        }
        
        // Default to English
        return 'english';
    }

    getLanguagePrefix(language) {
        const prefixes = {
            darija: {
                system: "أنت مساعد دردشة ذكي يتحدث الدارجة المغربية. رد دائماً بالدارجة المغربية. كن مفيداً، ودوداً، واختصار. استخدم التحيات والرموز التعبيرية المغربية.",
                response: "الرد بالدارجة المغربية:"
            },
            arabic: {
                system: "أنت مساعد دردشة ذكي يتحدث العربية. رد دائماً بالعربية الفصحى أو العامية المصرية. كن مفيداً وودياً واختصاراً.",
                response: "الرد بالعربية:"
            },
            french: {
                system: "Tu es un assistant de chat intelligent qui parle français. Réponds toujours en français. Sois utile, amical et concis. Utilise des émojis de temps en temps.",
                response: "Réponse en français:"
            },
            english: {
                system: "You are a smart Discord chat assistant. Always respond in English. Be helpful, friendly, and concise. Use emojis occasionally. Keep responses under 3 sentences.",
                response: "Response in English:"
            }
        };
        return prefixes[language] || prefixes.english;
    }

    async generateResponse(question, userId) {
        try {
            // Detect or get user's language
            let language = this.userLanguage.get(userId);
            if (!language) {
                language = this.detectLanguage(question);
                this.userLanguage.set(userId, language);
            }
            
            const langPref = this.getLanguagePrefix(language);
            
            // Get conversation history
            let history = this.conversationHistory.get(userId) || [];
            if (history.length > 10) history = history.slice(-10);
            
            // Build context
            let context = `${langPref.system}\n\n`;
            for (const exchange of history) {
                context += `User: ${exchange.user}\nAssistant: ${exchange.assistant}\n`;
            }
            context += `User: ${question}\nAssistant: ${langPref.response} `;
            
            // For now, use a rule-based response system with local intelligence
            // This avoids API keys and works offline while still supporting Darija
            const response = await this.generateLocalResponse(question, language, history);
            
            // Store in history
            history.push({ user: question, assistant: response });
            this.conversationHistory.set(userId, history);
            
            // Auto-clean old history after 30 minutes
            setTimeout(() => {
                if (this.conversationHistory.get(userId) === history) {
                    this.conversationHistory.delete(userId);
                    this.userLanguage.delete(userId);
                }
            }, 1800000);
            
            return response;
            
        } catch (error) {
            console.error('AI Response Error:', error);
            return this.getFallbackResponse(this.userLanguage.get(userId) || 'english');
        }
    }

    generateLocalResponse(question, language, history) {
        const lowerQuestion = question.toLowerCase();
        
        // Darija responses (Moroccan Arabic)
        if (language === 'darija') {
            if (lowerQuestion.includes('salam') || lowerQuestion.includes('ahlan') || lowerQuestion.includes('labas')) {
                return "🎉 Salamou 3likom! Labas? Kifach n3awnek lyoum? 😊";
            }
            if (lowerQuestion.includes('kifash') || lowerQuestion.includes('kif') || lowerQuestion.includes('kidayr')) {
                return "🤗 Lhamdullah, mzyan! Nta kidayr? Chno baghi t'sali?";
            }
            if (lowerQuestion.includes('shukran') || lowerQuestion.includes('merci')) {
                return "🥰 L3afou! Mzyan nsaa3dek. Hna lil wqtek!";
            }
            if (lowerQuestion.includes('wach') || lowerQuestion.includes('ash') || lowerQuestion.includes('chno')) {
                return "💡 Hado su'al mzyan! Wach baghi t'aref 3la haga mzyana?";
            }
            if (lowerQuestion.includes('7elwa') || lowerQuestion.includes('zwin') || lowerQuestion.includes('mezyan')) {
                return "😊 Chokran bzzaf! Nta lemezyan f lwqat. Kifash n'awenek lmara jaya?";
            }
            if (lowerQuestion.includes('3lach') || lowerQuestion.includes('lach')) {
                return "🤔 3lach? Hado su'al mezyan. Khassek t'aref had lhaja bnti9a. Wach baghi nshre7 lik b tafsir?";
            }
            return "🌙 Salam! Ana hna n3awenek. Wach tahder 3la haja mo3ayena? Awalo had su'al o ghatla9a jweb mzyan!";
        }
        
        // Arabic responses
        if (language === 'arabic') {
            if (lowerQuestion.includes('السلام') || lowerQuestion.includes('اهلا')) {
                return "✨ وعليكم السلام ورحمة الله! كيف أقدر أساعدك اليوم؟";
            }
            if (lowerQuestion.includes('كيف') || lowerQuestion.includes('حالك')) {
                return "🤗 الحمد لله بخير! شكراً للسؤال. كيف أقدر أخدمك؟";
            }
            if (lowerQuestion.includes('شكراً') || lowerQuestion.includes('شكرا')) {
                return "💖 عفواً! سعيد بمساعدتك. هل تريد شيئاً آخر؟";
            }
            if (lowerQuestion.includes('ماذا') || lowerQuestion.includes('ايش')) {
                return "💡 سؤال رائع! دعني أفكر في هذا. كيف يمكنني مساعدتك بشكل أفضل؟";
            }
            return "🌙 مرحباً! أنا هنا للمساعدة. ماذا تريد أن تعرف اليوم؟";
        }
        
        // French responses
        if (language === 'french') {
            if (lowerQuestion.includes('bonjour') || lowerQuestion.includes('salut')) {
                return "✨ Bonjour! Comment puis-je vous aider aujourd'hui?";
            }
            if (lowerQuestion.includes('comment') || lowerQuestion.includes('ça va')) {
                return "🤗 Très bien, merci! Et vous? Comment puis-je vous assister?";
            }
            if (lowerQuestion.includes('merci')) {
                return "💖 Avec plaisir! N'hésitez pas si vous avez d'autres questions.";
            }
            if (lowerQuestion.includes('quoi') || lowerQuestion.includes('pourquoi')) {
                return "💡 Excellente question! Laissez-moi réfléchir. Comment puis-je vous aider au mieux?";
            }
            return "🌙 Bonjour! Je suis là pour vous aider. De quoi avez-vous besoin aujourd'hui?";
        }
        
        // English responses (default)
        const greetings = ['hello', 'hi', 'hey', 'sup', 'yo', 'howdy'];
        const thanks = ['thank', 'thanks', 'thx', 'ty'];
        const questions = ['what', 'why', 'how', 'when', 'where', 'who'];
        
        if (greetings.some(word => lowerQuestion.includes(word))) {
            return "✨ Hello there! How can I help you today? 😊";
        }
        if (thanks.some(word => lowerQuestion.includes(word))) {
            return "💖 You're very welcome! Happy to help anytime!";
        }
        if (questions.some(word => lowerQuestion.includes(word))) {
            return "💡 Great question! Let me think about that. Is there anything specific you'd like to know?";
        }
        if (lowerQuestion.includes('love') || lowerQuestion.includes('like')) {
            return "🥰 That's awesome! I'm glad you feel that way. How can I make your day even better?";
        }
        
        return "🌙 Hi there! I'm your AI assistant. What would you like to talk about today? Feel free to ask me anything!";
    }

    getFallbackResponse(language) {
        const fallbacks = {
            darija: "😅 Désolé, ana chwiya t9ayad. 3awed su'al b tariqa okhra.",
            arabic: "😅 عذراً، واجهت مشكلة صغيرة. من فضلك أعد المحاولة مرة أخرى.",
            french: "😅 Désolé, j'ai rencontré un petit problème. Veuillez réessayer.",
            english: "😅 Sorry, I encountered a small issue. Please try again."
        };
        return fallbacks[language] || fallbacks.english;
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
