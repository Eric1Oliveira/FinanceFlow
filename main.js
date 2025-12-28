// Supabase Setup
    const SUPABASE_URL = 'https://rifbuuejnnlmrmgdnocc.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJpZmJ1dWVqbm5sbXJtZ2Rub2NjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MDQxNzUsImV4cCI6MjA4MjE4MDE3NX0.D-i_5Dytfop_yDOtK8Acco5vtKWdtXaDFBgLF2yxpMA';
    
    const { createClient } = supabase;
    let supabaseClient;
    
    if (!window.supabaseClient) {
      window.supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);
    }
    supabaseClient = window.supabaseClient;

    // Estado de autenticação
    let currentUser = null;
    let currentSession = null;

    // State
    let transactions = [];
    let cards = [];
    let goals = [];
    let recurringTransactions = [];
    let currentViewDate = new Date();
    let currentPage = 'dashboard'; // Rastreia a página atual
    let categories = [
      { id: 1, name: 'Salário', type: 'receita' },
      { id: 2, name: 'Freelance', type: 'receita' },
      { id: 3, name: 'Investimento', type: 'receita' },
      { id: 4, name: 'Alimentação', type: 'despesa' },
      { id: 5, name: 'Transporte', type: 'despesa' },
      { id: 6, name: 'Moradia', type: 'despesa' },
      { id: 7, name: 'Saúde', type: 'despesa' },
      { id: 8, name: 'Educação', type: 'despesa' },
      { id: 9, name: 'Lazer', type: 'despesa' },
      { id: 10, name: 'Compras', type: 'despesa' },
      { id: 11, name: 'Contas', type: 'despesa' },
      { id: 12, name: 'Outros', type: 'despesa' }
    ];
    let userStats = {
      level: 1,
      xp: 0,
      totalTransactions: 0
    };

    // Initialize
    async function init() {
      // Verificar sessão do usuário
      await checkSession();
      
      // Se não há usuário logado, a tela de login fica visível
      if (!currentUser) {
        return;
      }
      
      // Se há usuário logado, mostrar app
      document.getElementById('authContainer').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      
      await createTablesIfNotExist();
      await loadData();
      await checkAdminStatus();
      
      // Inicializa a página com o Dashboard ativo
      navigateTo('dashboard');
      
      // Atualiza o ícone do tema
      updateThemeToggleIcon();
      
      setDefaultDate();
    }

    // Verificar se é admin
    async function checkAdminStatus() {
      try {
        if (!currentUser) return;
        
        const { data, error } = await supabaseClient
          .from('profiles')
          .select('is_admin')
          .eq('id', currentUser.id)
          .single();
        
        if (error) throw error;
        
        const isAdmin = data?.is_admin || false;
        const themeBtn = document.getElementById('themeToggleBtn');
        
        if (themeBtn) {
          if (isAdmin) {
            themeBtn.style.display = 'flex';
          } else {
            themeBtn.style.display = 'none';
          }
        }
      } catch (error) {
        console.error('Erro ao verificar status de admin:', error);
        // Esconder botão de tema se houver erro
        const themeBtn = document.getElementById('themeToggleBtn');
        if (themeBtn) themeBtn.style.display = 'none';
      }
    }

    // Verificar sessão do usuário
    async function checkSession() {
      try {
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        
        if (error) throw error;
        
        if (session) {
          currentSession = session;
          currentUser = session.user;
        }
      } catch (error) {
        console.error('Erro ao verificar sessão:', error);
      }
    }

    // Fazer login
    async function handleLogin(e) {
      e.preventDefault();
      
      const email = document.getElementById('loginEmail').value;
      const password = document.getElementById('loginPassword').value;
      
      const loginBtn = e.target.querySelector('button[type="submit"]');
      loginBtn.disabled = true;
      loginBtn.textContent = 'Entrando...';
      
      // Timeout de segurança (15 segundos)
      const timeoutId = setTimeout(() => {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Entrar';
        showToast('Login demorou muito. Tente novamente.', 'error');
      }, 15000);
      
      try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
          email,
          password
        });
        
        clearTimeout(timeoutId);
        
        if (error) throw error;
        
        if (!data.user) {
          throw new Error('Falha na autenticação. Tente novamente.');
        }
        
        currentUser = data.user;
        currentSession = data.session;
        
        showToast('Bem-vindo de volta!', 'success');
        document.getElementById('authContainer').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        
        updateUserProfileName();
        initTheme();
        await loadData();
        navigateTo('dashboard');
        setDefaultDate();
        
        // Verificar status de admin em background (sem bloquear)
        checkAdminStatus();
      } catch (error) {
        clearTimeout(timeoutId);
        console.error('Erro ao fazer login:', error);
        showToast(error.message || 'Erro ao fazer login. Verifique suas credenciais.', 'error');
        
        loginBtn.disabled = false;
        loginBtn.textContent = 'Entrar';
      }
    }

    // Fazer cadastro
    async function handleSignup(e) {
      e.preventDefault();
      
      const fullName = document.getElementById('signupName').value;
      const email = document.getElementById('signupEmail').value;
      const password = document.getElementById('signupPassword').value;
      const passwordConfirm = document.getElementById('signupPasswordConfirm').value;
      
      if (password !== passwordConfirm) {
        showToast('As senhas não correspondem!', 'error');
        return;
      }
      
      const signupBtn = e.target.querySelector('button[type="submit"]');
      signupBtn.disabled = true;
      signupBtn.textContent = 'Criando conta...';
      
      // Timeout de segurança (20 segundos)
      const timeoutId = setTimeout(() => {
        signupBtn.disabled = false;
        signupBtn.textContent = 'Criar Conta';
        showToast('Cadastro demorou muito. Tente novamente.', 'error');
      }, 20000);
      
      try {
        const { data, error } = await supabaseClient.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName
            }
          }
        });
        
        clearTimeout(timeoutId);
        
        if (error) throw error;
        
        if (!data.user) {
          throw new Error('Falha no cadastro. Tente novamente.');
        }
        
        currentUser = data.user;
        currentSession = data.session;
        
        showToast('Conta criada com sucesso! Bem-vindo!', 'success');
        document.getElementById('authContainer').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        
        updateUserProfileName();
        setTheme('light');
        await loadData();
        navigateTo('dashboard');
        setDefaultDate();
        
        // Verificar status de admin em background (sem bloquear)
        checkAdminStatus();
      } catch (error) {
        clearTimeout(timeoutId);
        console.error('Erro ao criar conta:', error);
        showToast(error.message || 'Erro ao criar conta. Tente novamente.', 'error');
        
        signupBtn.disabled = false;
        signupBtn.textContent = 'Criar Conta';
      }
    }

    // Atualizar nome do usuário na sidebar
    function updateUserProfileName() {
      if (currentUser) {
        const fullName = currentUser.user_metadata?.full_name || currentUser.email || 'Usuário';
        const userNameElement = document.getElementById('userProfileName');
        if (userNameElement) {
          userNameElement.textContent = fullName;
        }
      }
    }

    // Alternar entre Login e Signup
    function toggleAuthForm() {
      const loginForm = document.getElementById('loginForm');
      const signupForm = document.getElementById('signupForm');
      
      loginForm.classList.toggle('hidden');
      signupForm.classList.toggle('hidden');
      
      // Limpar formulários
      document.getElementById('loginEmail').value = '';
      document.getElementById('loginPassword').value = '';
      document.getElementById('signupName').value = '';
      document.getElementById('signupEmail').value = '';
      document.getElementById('signupPassword').value = '';
      document.getElementById('signupPasswordConfirm').value = '';
    }

    // Fazer logout
    async function handleLogout() {
      try {
        await supabaseClient.auth.signOut();
        currentUser = null;
        currentSession = null;
        
        // Limpar dados
        transactions = [];
        cards = [];
        goals = [];
        recurringTransactions = [];
        
        document.getElementById('app').classList.add('hidden');
        document.getElementById('authContainer').classList.remove('hidden');
        document.getElementById('loginForm').classList.remove('hidden');
        document.getElementById('signupForm').classList.add('hidden');
        
        showToast('Desconectado com sucesso!', 'success');
      } catch (error) {
        console.error('Erro ao fazer logout:', error);
        showToast('Erro ao desconectar.', 'error');
      }
    }

    // Create tables if they don't exist
    async function createTablesIfNotExist() {
      try {
        const { data: tablesData } = await supabaseClient
          .from('transactions')
          .select('id')
          .limit(1);
      } catch (error) {
        console.log('Tables may not exist yet, but app will work with empty data');
      }
    }

    // Load all data
    async function loadData() {
      try {
        // Verificar se há usuário logado
        if (!currentUser) {
          return;
        }
        
        const transactionsResult = await supabaseClient
          .from('transactions')
          .select('*')
          .eq('user_id', currentUser.id)
          .order('date', { ascending: false });
        
        if (transactionsResult.error) {
          console.warn('Erro ao carregar transações:', transactionsResult.error);
        } else if (transactionsResult.data) {
          transactions = transactionsResult.data;
        }

        const cardsResult = await supabaseClient
          .from('cards')
          .select('*')
          .eq('user_id', currentUser.id)
          .order('created_at', { ascending: false });
        
        if (cardsResult.error) {
          console.warn('Erro ao carregar cartões:', cardsResult.error);
        } else if (cardsResult.data) {
          cards = cardsResult.data;
        }

        const goalsResult = await supabaseClient
          .from('goals')
          .select('*')
          .eq('user_id', currentUser.id)
          .order('created_at', { ascending: false });
        
        if (goalsResult.error) {
          console.warn('Erro ao carregar metas:', goalsResult.error);
        } else if (goalsResult.data) {
          goals = goalsResult.data;
        }

        const categoriesResult = await supabaseClient
          .from('categories')
          .select('*')
          .order('name', { ascending: true });
        
        if (categoriesResult.error) {
          console.warn('Erro ao carregar categorias:', categoriesResult.error);
        } else if (categoriesResult.data && categoriesResult.data.length > 0) {
          categories = categoriesResult.data;
        }

        const recurringResult = await supabaseClient
          .from('recurring_transactions')
          .select('*')
          .eq('user_id', currentUser.id)
          .eq('is_active', true)
          .order('day_of_month', { ascending: true });
        
        if (recurringResult.error) {
          console.warn('Erro ao carregar recorrentes:', recurringResult.error);
        } else if (recurringResult.data) {
          recurringTransactions = recurringResult.data;
        }

        await processRecurringTransactions();
        calculateUserStats();
      } catch (error) {
        console.warn('Erro ao carregar dados:', error);
      }
    }

    function calculateUserStats() {
      userStats.totalTransactions = transactions.length;
      userStats.xp = transactions.length * 10 + goals.filter(g => g.current_amount >= g.target_amount).length * 50;
      userStats.level = Math.floor(userStats.xp / 100) + 1;
    }

    async function processRecurringTransactions() {
      const today = new Date();
      const currentDay = today.getDate();
      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();

      // Carregar mapeamentos de cartões do localStorage
      const cardMappings = JSON.parse(localStorage.getItem('recurring_card_mappings') || '{}');

      for (const recurring of recurringTransactions) {
        const startDate = new Date(recurring.start_date + 'T00:00:00');
        
        if (today < startDate) {
          continue;
        }

        if (recurring.duration_type === 'temporary' && recurring.duration_months) {
          const expirationDate = new Date(startDate);
          expirationDate.setMonth(expirationDate.getMonth() + recurring.duration_months);
          
          if (today >= expirationDate) {
            await supabaseClient
              .from('recurring_transactions')
              .update({ is_active: false })
              .eq('id', recurring.id);
            continue;
          }
        }

        // Verifica se devemos criar a transação no mês de início
        const startMonth = startDate.getMonth();
        const startYear = startDate.getFullYear();
        const isStartMonth = currentMonth === startMonth && currentYear === startYear;
        
        // Se for o mês de início, cria a transação independente do dia
        // Se não for o mês de início, só cria se já passou do dia recorrente
        if (isStartMonth || currentDay >= recurring.day_of_month) {
          const transactionDate = new Date(currentYear, currentMonth, recurring.day_of_month);
          const dateString = transactionDate.toISOString().split('T')[0];
          
          const existingTransaction = transactions.find(t => 
            t.description === recurring.description &&
            t.date === dateString &&
            t.amount === parseFloat(recurring.amount)
          );

          if (!existingTransaction) {
            let paymentMethod = null;
            let cardId = null;
            
            // Buscar card_id do localStorage
            if (cardMappings[recurring.id]) {
              cardId = cardMappings[recurring.id];
              const card = cards.find(c => c.id === cardId);
              if (card) {
                paymentMethod = card.type;
              }
            }
            
            const newTransaction = {
              type: recurring.type,
              description: recurring.description,
              amount: recurring.amount,
              category: recurring.category,
              date: dateString,
              payment_method: paymentMethod,
              card_id: cardId,
              installments: 1,
              current_installment: 1
            };

            await supabaseClient.from('transactions').insert([newTransaction]);
          }
        }
      }
    }

    function getProjectedRecurringTransactions(month, year) {
      const projectedTransactions = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const targetMonthStart = new Date(year, month, 1);
      const targetMonthEnd = new Date(year, month + 1, 0);

      // Carregar mapeamentos de cartões do localStorage
      const cardMappings = JSON.parse(localStorage.getItem('recurring_card_mappings') || '{}');

      for (const recurring of recurringTransactions) {
        const startDate = new Date(recurring.start_date + 'T00:00:00');
        startDate.setHours(0, 0, 0, 0);
        
        // Verifica se a recorrente já deve ter iniciado
        if (targetMonthStart < new Date(startDate.getFullYear(), startDate.getMonth(), 1)) {
          continue;
        }

        // Verifica se a recorrente temporária já expirou
        if (recurring.duration_type === 'temporary' && recurring.duration_months) {
          const expirationDate = new Date(startDate);
          expirationDate.setMonth(expirationDate.getMonth() + recurring.duration_months);
          
          if (targetMonthEnd >= expirationDate) {
            continue;
          }
        }

        const transactionDate = new Date(year, month, recurring.day_of_month);
        const dateString = transactionDate.toISOString().split('T')[0];

        // Verifica se já existe uma transação real com os mesmos dados
        const existingTransaction = transactions.find(t => 
          t.description === recurring.description &&
          t.date === dateString &&
          t.amount === parseFloat(recurring.amount)
        );

        if (!existingTransaction) {
          let paymentMethod = null;
          let cardId = null;
          
          // Buscar card_id do localStorage
          if (cardMappings[recurring.id]) {
            cardId = cardMappings[recurring.id];
            const card = cards.find(c => c.id === cardId);
            if (card) {
              paymentMethod = card.type;
            }
          }
          
          // REGRA: Se o dia da recorrência já passou no mês visualizado, NÃO é projeção
          const isFutureProjection = transactionDate > today;
          
          projectedTransactions.push({
            id: `recurring_${recurring.id}_${month}_${year}`,
            type: recurring.type,
            description: recurring.description,
            amount: parseFloat(recurring.amount),
            category: recurring.category,
            date: dateString,
            payment_method: paymentMethod,
            card_id: cardId,
            installments: 1,
            current_installment: 1,
            is_projected: isFutureProjection
          });
        }
      }

      return projectedTransactions;
    }

    function navigateTo(page) {
      const pages = document.querySelectorAll('.page');
      const sidebarItems = document.querySelectorAll('.sidebar-item');

      // Remove active class de todas as páginas
      pages.forEach(p => p.classList.remove('active'));
      
      // Remove active class de todos os itens do sidebar
      sidebarItems.forEach(item => item.classList.remove('active'));

      // Adiciona active class à página correta
      const pageElement = document.getElementById(page + 'Page');
      if (pageElement) {
        pageElement.classList.add('active');
      }

      // Salva a página atual
      currentPage = page;

      updateUI();
    }

    function updateUI() {
      updateStats();
      updateLevelDisplay();
      renderTransactions();
      renderCards();
      renderGoals();
      renderGoalsPreview();
      renderAchievements();
      renderCategories();
      renderRecurringTransactions();
      renderCategoryChart();
      renderRecentTransactions();
      updateCardSelectionOptions();
      updateCategoryOptions();
    }

    function updateStats() {
      const viewMonth = currentViewDate.getMonth();
      const viewYear = currentViewDate.getFullYear();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();
      const isCurrentMonth = viewMonth === currentMonth && viewYear === currentYear;
      const isFutureMonth = new Date(viewYear, viewMonth, 1) > new Date(currentYear, currentMonth, 1);
      const isPastMonth = new Date(viewYear, viewMonth, 1) < new Date(currentYear, currentMonth, 1);

      // Calcula saldo acumulado de TODOS os meses ANTERIORES ao visualizado (APENAS transações reais)
      let accumulatedBalance = 0;
      
      // Filtra TODAS as transações ANTERIORES ao mês visualizado
      const viewMonthKey = viewYear * 12 + viewMonth;
      const currentMonthKey = currentYear * 12 + currentMonth;
      
      const previousTransactions = transactions.filter(t => {
        const tDate = new Date(t.date + 'T00:00:00');
        const transactionMonthKey = tDate.getFullYear() * 12 + tDate.getMonth();
        return transactionMonthKey < viewMonthKey;
      });

      // Calcula saldo acumulado (receitas - despesas não-crédito - pagamentos de fatura)
      previousTransactions.forEach(t => {
        if (t.type === 'receita') {
          accumulatedBalance += parseFloat(t.amount);
        } else if (t.type === 'despesa') {
          // Só desconta do saldo se não for compra no crédito (que ainda não foi paga)
          if (t.payment_method !== 'credito') {
            accumulatedBalance -= parseFloat(t.amount);
          }
          // Compras no crédito NÃO descontam do saldo até a fatura ser paga
        }
      });

      // Se estamos visualizando um mês FUTURO, precisamos adicionar as recorrências dos meses entre hoje e o mês visualizado
      if (isFutureMonth) {
        // Processar cada mês entre o mês atual e o mês visualizado
        for (let mk = currentMonthKey; mk < viewMonthKey; mk++) {
          const tempYear = Math.floor(mk / 12);
          const tempMonth = mk % 12;
          
          const tempRecurrings = getProjectedRecurringTransactions(tempMonth, tempYear);
          
          tempRecurrings.forEach(t => {
            if (t.type === 'receita') {
              accumulatedBalance += parseFloat(t.amount);
            } else if (t.type === 'despesa' && t.payment_method !== 'credito') {
              accumulatedBalance -= parseFloat(t.amount);
            }
          });
        }
      }

      // Transações REAIS do mês visualizado
      const monthTransactions = transactions.filter(t => {
        const tDate = new Date(t.date + 'T00:00:00');
        return tDate.getMonth() === viewMonth && tDate.getFullYear() === viewYear;
      });

      // Recorrências do mês visualizado (separadas em reais e projetadas)
      const projectedRecurrings = getProjectedRecurringTransactions(viewMonth, viewYear);
      const realRecurrings = projectedRecurrings.filter(t => !t.is_projected);
      const futureRecurrings = projectedRecurrings.filter(t => t.is_projected);

      // Calcula receitas REAIS do mês (incluindo recorrências que já passaram da data)
      const realIncome = monthTransactions
        .filter(t => t.type === 'receita')
        .reduce((sum, t) => sum + parseFloat(t.amount), 0) +
        realRecurrings
          .filter(t => t.type === 'receita')
          .reduce((sum, t) => sum + parseFloat(t.amount), 0);

      // Calcula despesas TOTAIS do mês (INCLUINDO crédito à vista, parcelado e recorrente)
      // NÃO inclui NENHUM tipo de pagamento (pagamento_fatura, pagamento_recorrente)
      // porque pagamento não é consumo/despesa, é apenas liquidação de dívida
      const realExpensesTotal = monthTransactions
        .filter(t => t.type === 'despesa' && t.payment_method !== 'pagamento_fatura' && t.payment_method !== 'pagamento_recorrente')
        .reduce((sum, t) => sum + parseFloat(t.amount), 0) +
        realRecurrings
          .filter(t => t.type === 'despesa' && t.payment_method !== 'pagamento_fatura' && t.payment_method !== 'pagamento_recorrente')
          .reduce((sum, t) => sum + parseFloat(t.amount), 0);

      // Calcula despesas que afetam o SALDO
      // DÉBITO: desconta na hora
      // CRÉDITO à vista, parcelado, recorrente: NÃO descontam aqui
      // PAGAMENTO_FATURA e PAGAMENTO_RECORRENTE: SIM, descontam porque é liquidação real
      const realExpensesForBalance = monthTransactions
        .filter(t => {
          // Inclui débito, dinheiro, etc
          if (t.payment_method !== 'credito' && t.payment_method !== 'pagamento_fatura' && t.payment_method !== 'pagamento_recorrente' && t.type === 'despesa') {
            return true;
          }
          // Inclui pagamentos de fatura (liquidação real)
          if ((t.payment_method === 'pagamento_fatura' || t.payment_method === 'pagamento_recorrente') && t.type === 'despesa') {
            return true;
          }
          return false;
        })
        .reduce((sum, t) => sum + parseFloat(t.amount), 0) +
        realRecurrings
          .filter(t => {
            // Inclui débito, dinheiro, etc
            if (t.payment_method !== 'credito' && t.payment_method !== 'pagamento_fatura' && t.payment_method !== 'pagamento_recorrente' && t.type === 'despesa') {
              return true;
            }
            // Inclui pagamentos de fatura (liquidação real)
            if ((t.payment_method === 'pagamento_fatura' || t.payment_method === 'pagamento_recorrente') && t.type === 'despesa') {
              return true;
            }
            return false;
          })
          .reduce((sum, t) => sum + parseFloat(t.amount), 0);

      // Saldo real do mês (só desconta despesas não-crédito)
      const monthBalance = realIncome - realExpensesForBalance;
      const totalBalance = accumulatedBalance + monthBalance;

      // Para o mês ATUAL ou FUTURO, mostra projeções SEPARADAMENTE (apenas futuras)
      let projectedIncome = 0;
      let projectedExpensesTotal = 0;
      let projectedExpensesForBalance = 0;
      let hasProjections = false;

      if (isCurrentMonth || isFutureMonth) {
        hasProjections = futureRecurrings.length > 0;

        if (hasProjections) {
          projectedIncome = futureRecurrings
            .filter(t => t.type === 'receita')
            .reduce((sum, t) => sum + parseFloat(t.amount), 0);

          // Todas as despesas projetadas (incluindo crédito)
          projectedExpensesTotal = futureRecurrings
            .filter(t => t.type === 'despesa')
            .reduce((sum, t) => sum + parseFloat(t.amount), 0);

          // Despesas projetadas que afetam saldo (sem crédito)
          projectedExpensesForBalance = futureRecurrings
            .filter(t => t.type === 'despesa' && t.payment_method !== 'credito')
            .reduce((sum, t) => sum + parseFloat(t.amount), 0);
        }
      }

      const balanceEl = document.getElementById('totalBalance');
      const incomeEl = document.getElementById('monthIncome');
      const expensesEl = document.getElementById('monthExpenses');

      // SALDO TOTAL (só considera despesas não-crédito)
      if (isFutureMonth) {
        // Para meses futuros, sempre mostra projeção (com ou sem recorrências)
        const projectedBalance = totalBalance + projectedIncome - projectedExpensesForBalance;
        balanceEl.innerHTML = `${formatCurrency(projectedBalance)} <span class="text-xs text-blue-400 ml-1">📊 Projetado</span>`;
      } else if (isCurrentMonth && hasProjections) {
        // Para mês atual, mostra saldo real + projeção do que falta
        const projectedBalance = totalBalance + projectedIncome - projectedExpensesForBalance;
        balanceEl.innerHTML = `${formatCurrency(totalBalance)} <span class="text-xs text-gray-500 ml-1">(${formatCurrency(projectedBalance)} projetado)</span>`;
      } else {
        // Para meses passados ou mês atual sem projeção, mostra apenas saldo real
        balanceEl.textContent = formatCurrency(totalBalance);
      }

      // RECEITAS E DESPESAS - mostra TODAS as despesas (incluindo crédito) no card
      const totalIncome = realIncome + projectedIncome;
      const totalExpenses = realExpensesTotal + projectedExpensesTotal;
      
      if (hasProjections) {
        if (realIncome > 0) {
          incomeEl.innerHTML = `${formatCurrency(totalIncome)} <span class="text-xs text-gray-500 ml-1">(${formatCurrency(realIncome)} real + <span class="text-blue-400">${formatCurrency(projectedIncome)} 📊</span>)</span>`;
        } else {
          incomeEl.innerHTML = `${formatCurrency(totalIncome)} <span class="text-xs text-blue-400 ml-1">📊 Projetado</span>`;
        }
        
        if (realExpensesTotal > 0) {
          expensesEl.innerHTML = `${formatCurrency(totalExpenses)} <span class="text-xs text-gray-500 ml-1">(${formatCurrency(realExpensesTotal)} real + <span class="text-blue-400">${formatCurrency(projectedExpensesTotal)} 📊</span>)</span>`;
        } else {
          expensesEl.innerHTML = `${formatCurrency(totalExpenses)} <span class="text-xs text-blue-400 ml-1">📊 Projetado</span>`;
        }
      } else if (isFutureMonth) {
        // Mês futuro sem recorrências - mostra apenas as transações reais já cadastradas
        incomeEl.innerHTML = `${formatCurrency(realIncome)} ${realIncome > 0 ? '<span class="text-xs text-blue-400 ml-1">📊 Projetado</span>' : ''}`;
        expensesEl.innerHTML = `${formatCurrency(realExpensesTotal)} ${realExpensesTotal > 0 ? '<span class="text-xs text-blue-400 ml-1">📊 Projetado</span>' : ''}`;
      } else {
        incomeEl.textContent = formatCurrency(realIncome);
        expensesEl.textContent = formatCurrency(realExpensesTotal);
      }
      
      updateMonthLabels();
    }

    function updateLevelDisplay() {
      const currentLevelXP = userStats.xp % 100;
      const progress = (currentLevelXP / 100) * 100;

      const levelMini = document.getElementById('levelNumberMini');
      if (levelMini) levelMini.textContent = userStats.level;
      
      const currentXPMini = document.getElementById('currentXPMini');
      const nextLevelXPMini = document.getElementById('nextLevelXPMini');
      if (currentXPMini) currentXPMini.textContent = currentLevelXP;
      if (nextLevelXPMini) nextLevelXPMini.textContent = 100;

      const circleMini = document.getElementById('xpCircleMini');
      if (circleMini) {
        const circumference = 62.8;
        const offset = circumference - (progress / 100) * circumference;
        circleMini.style.strokeDashoffset = offset;
      }
    }

    function calculateCardUsage(cardId) {
      const card = cards.find(c => c.id === cardId);
      if (!card) return 0;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();

      let blockedLimit = 0;

      // 1. COMPRAS NO CRÉDITO (PARCELADAS OU À VISTA)
      // Bloqueiam o VALOR TOTAL da compra, independente de quantas parcelas
      const purchaseGroups = {};
      
      transactions
        .filter(t => t.card_id === cardId && 
                     t.type === 'despesa' && 
                     t.payment_method === 'credito')
        .forEach(t => {
          const key = `${t.description}_${t.installments}_${t.amount}`;
          
          if (!purchaseGroups[key]) {
            purchaseGroups[key] = {
              totalAmount: parseFloat(t.amount) * t.installments,
              alreadyCounted: false
            };
          }
        });

      // Soma o valor total de cada compra (uma vez apenas)
      Object.values(purchaseGroups).forEach(group => {
        blockedLimit += group.totalAmount;
      });

      // 2. RECORRENTES NO CRÉDITO
      // Bloqueiam APENAS o valor do mês atual (não bloqueiam recorrências futuras)
      const projectedRecurrings = getProjectedRecurringTransactions(currentMonth, currentYear);
      const recurringBlockage = projectedRecurrings
        .filter(t => {
          if (t.card_id !== cardId || t.type !== 'despesa' || t.payment_method !== 'credito') {
            return false;
          }
          
          // Só bloqueia se for do mês atual (não bloqueia recorrências futuras)
          const tDate = new Date(t.date + 'T00:00:00');
          return tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear;
        })
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);

      blockedLimit += recurringBlockage;

      // 3. SUBTRAIR PAGAMENTOS JÁ REALIZADOS NO MÊS ATUAL
      // Reduz o bloqueio conforme os pagamentos são feitos
      const paymentsThisMonth = transactions
        .filter(t => t.payment_method === 'pagamento_fatura' && 
                     t.description && 
                     t.description.includes(card.name))
        .filter(t => {
          const tDate = new Date(t.date + 'T00:00:00');
          return tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear;
        })
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);

      blockedLimit -= paymentsThisMonth;
      
      // Garantir que não fica negativo
      blockedLimit = Math.max(0, blockedLimit);

      return blockedLimit;
    }

    function calculateCurrentMonthInvoice(cardId) {
      const card = cards.find(c => c.id === cardId);
      if (!card) return 0;

      const now = new Date();
      
      // Transações reais do cartão
      const realTransactions = transactions
        .filter(t => {
          if (t.card_id !== cardId || t.type !== 'despesa' || t.payment_method !== 'credito') {
            return false;
          }
          
          const installmentDate = new Date(t.date + 'T00:00:00');
          return installmentDate.getMonth() === now.getMonth() && 
                 installmentDate.getFullYear() === now.getFullYear();
        })
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);
      
      // Recorrentes projetadas para o mês atual
      const projectedRecurrings = getProjectedRecurringTransactions(now.getMonth(), now.getFullYear());
      const recurringTransactions = projectedRecurrings
        .filter(t => t.card_id === cardId && t.type === 'despesa' && t.payment_method === 'credito')
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);
      
      // Subtrair pagamentos já feitos no mês atual
      const paymentsThisMonth = transactions
        .filter(t => t.payment_method === 'pagamento_fatura' && 
                     t.description && 
                     t.description.includes(card.name))
        .filter(t => {
          const tDate = new Date(t.date + 'T00:00:00');
          return tDate.getMonth() === now.getMonth() && tDate.getFullYear() === now.getFullYear();
        })
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);
      
      const totalInvoice = realTransactions + recurringTransactions - paymentsThisMonth;
      
      // Garantir que não fica negativo
      return Math.max(0, totalInvoice);
    }

    function calculateDebitCardBalance(cardId) {
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      
      // Transações reais do cartão
      const cardTransactions = transactions.filter(t => t.card_id === cardId);
      
      const income = cardTransactions
        .filter(t => t.type === 'receita')
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);
      
      const expenses = cardTransactions
        .filter(t => t.type === 'despesa')
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);
      
      let balance = income - expenses;
      
      // Adicionar recorrências projetadas do mês atual que usam este cartão
      const projectedRecurrings = getProjectedRecurringTransactions(currentMonth, currentYear);
      
      projectedRecurrings.forEach(t => {
        if (t.card_id === cardId) {
          if (t.type === 'receita') {
            balance += parseFloat(t.amount);
          } else if (t.type === 'despesa') {
            balance -= parseFloat(t.amount);
          }
        }
      });
      
      return balance;
    }

    function renderCategoryChart() {
      const container = document.getElementById('categoryChart');
      
      const viewMonth = currentViewDate.getMonth();
      const viewYear = currentViewDate.getFullYear();

      const monthExpenses = transactions.filter(t => {
        const tDate = new Date(t.date + 'T00:00:00');
        return t.type === 'despesa' && 
               t.payment_method !== 'credito' &&
               tDate.getMonth() === viewMonth && 
               tDate.getFullYear() === viewYear;
      });

      const categoryTotals = {};
      monthExpenses.forEach(t => {
        if (!categoryTotals[t.category]) {
          categoryTotals[t.category] = 0;
        }
        categoryTotals[t.category] += parseFloat(t.amount);
      });

      const sortedCategories = Object.entries(categoryTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      const total = sortedCategories.reduce((sum, [_, amount]) => sum + amount, 0);

      if (sortedCategories.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-center py-8">Nenhuma despesa este mês</p>';
        return;
      }

      container.innerHTML = sortedCategories.map(([category, amount]) => {
        const percentage = (amount / total) * 100;
        return `
          <div class="mb-4">
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm">${category}</span>
              <span class="text-sm font-bold text-green-500">${formatCurrency(amount)}</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${percentage}%"></div>
            </div>
          </div>
        `;
      }).join('');
    }

    function renderRecentTransactions() {
      const container = document.getElementById('recentTransactions');
      
      // Filtrar apenas transações do mês atual
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      
      const currentMonthTransactions = transactions.filter(t => {
        const tDate = new Date(t.date + 'T00:00:00');
        return tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear;
      });
      
      const recent = currentMonthTransactions.slice(0, 5);

      if (recent.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-center py-8">Nenhuma transação este mês</p>';
        return;
      }

      container.innerHTML = recent.map(t => {
        const isIncome = t.type === 'receita';
        const isCreditPurchase = t.type === 'despesa' && t.payment_method === 'credito';
        
        let color, icon;
        if (isIncome) {
          color = 'text-green-500';
          icon = '↑';
        } else if (isCreditPurchase) {
          color = 'text-yellow-500';
          icon = '💳';
        } else {
          color = 'text-red-500';
          icon = '↓';
        }
        
        return `
          <div class="flex items-center justify-between py-3 border-b border-gray-800 last:border-0">
            <div class="flex items-center gap-3">
              <span class="${color} text-xl font-bold">${icon}</span>
              <div>
                <p class="font-semibold text-sm">${t.description}</p>
                <p class="text-xs text-gray-400">${formatDate(t.date)}</p>
              </div>
            </div>
            <p class="${color} font-bold">${isIncome ? '+' : isCreditPurchase ? '' : '-'} ${formatCurrency(t.amount)}</p>
          </div>
        `;
      }).join('');
    }

    function renderTransactions(filter = 'all') {
      const container = document.getElementById('transactionsList');
      const viewMonth = currentViewDate.getMonth();
      const viewYear = currentViewDate.getFullYear();
      const today = new Date();
      const isFutureMonth = currentViewDate > new Date(today.getFullYear(), today.getMonth(), today.getDate());
      
      let filteredTransactions = transactions.filter(t => {
        const tDate = new Date(t.date + 'T00:00:00');
        return tDate.getMonth() === viewMonth && tDate.getFullYear() === viewYear;
      });

      let projectedRecurrings = [];
      if (isFutureMonth) {
        projectedRecurrings = getProjectedRecurringTransactions(viewMonth, viewYear);
      }

      const allTransactions = [...filteredTransactions, ...projectedRecurrings];

      if (filter !== 'all') {
        const filtered = allTransactions.filter(t => t.type === filter);
        filteredTransactions = filtered;
      } else {
        filteredTransactions = allTransactions;
      }

      if (filteredTransactions.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-center py-8">Nenhuma transação encontrada</p>';
        return;
      }

      container.innerHTML = filteredTransactions.map(t => {
        const isIncome = t.type === 'receita';
        const isCreditPurchase = t.type === 'despesa' && t.payment_method === 'credito';
        const isInvoicePayment = t.payment_method === 'pagamento_fatura';
        const isProjected = t.is_projected === true;
        
        let color, icon, label;
        if (isIncome) {
          color = 'text-green-500';
          icon = '↑';
          label = '';
        } else if (isCreditPurchase) {
          color = 'text-yellow-500';
          icon = '💳';
          label = '<span class="text-xs bg-yellow-900 text-yellow-300 px-2 py-1 rounded ml-2">Fatura</span>';
        } else if (isInvoicePayment) {
          color = 'text-blue-500';
          icon = '💰';
          label = '<span class="text-xs bg-blue-900 text-blue-300 px-2 py-1 rounded ml-2">Pagamento</span>';
        } else {
          color = 'text-red-500';
          icon = '↓';
          label = '';
        }
        
        const projectedClass = isProjected ? 'projected' : '';
        const projectedLabel = isProjected ? '<span class="text-xs bg-blue-900 text-blue-300 px-2 py-1 rounded ml-2">📊 Projeção</span>' : '';
        
        return `
          <div class="transaction-item ${projectedClass}">
            <div class="flex items-center justify-between">
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <span class="${color} text-xl font-bold">${icon}</span>
                  <h4 class="font-semibold">${t.description}</h4>
                  ${label}
                  ${projectedLabel}
                </div>
                <div class="flex items-center gap-3 text-sm text-gray-400">
                  <span>${formatDate(t.date)}</span>
                  <span>•</span>
                  <span>${t.category}</span>
                  ${t.payment_method && !isInvoicePayment ? `<span>•</span><span>${t.payment_method}</span>` : ''}
                  ${t.installments > 1 ? `<span>•</span><span>Parcela ${t.current_installment}/${t.installments}</span>` : ''}
                </div>
              </div>
              <div class="text-right flex items-center gap-3">
                <p class="${color} text-xl font-bold">${isIncome ? '+' : isCreditPurchase ? '' : '-'} ${formatCurrency(t.amount)}</p>
                ${!isProjected ? `
                  <button onclick="deleteTransaction(${t.id}, '${t.description.replace(/'/g, "\\'")}', ${t.installments}, ${t.current_installment})" class="text-red-500 hover:text-red-400 transition p-2 hover:bg-red-900 hover:bg-opacity-20 rounded" title="Excluir transação">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M3 5H17M15 5V16C15 16.5523 14.5523 17 14 17H6C5.44772 17 5 16.5523 5 16V5M7 5V4C7 3.44772 7.44772 3 8 3H12C12.5523 3 13 3.44772 13 4V5M8 9V13M12 9V13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                  </button>
                ` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    function calculateFutureInvoices(cardId) {
      const card = cards.find(c => c.id === cardId);
      if (!card) return [];

      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const futureInvoices = new Map();

      // Transações reais já cadastradas (parcelas futuras)
      transactions
        .filter(t => {
          if (t.card_id !== cardId || t.type !== 'despesa' || t.payment_method !== 'credito') {
            return false;
          }
          
          const installmentDate = new Date(t.date + 'T00:00:00');
          const transactionMonthKey = installmentDate.getFullYear() * 12 + installmentDate.getMonth();
          const currentMonthKey = currentYear * 12 + currentMonth;
          
          // Apenas parcelas FUTURAS (após o mês atual)
          return transactionMonthKey > currentMonthKey;
        })
        .forEach(t => {
          const installmentDate = new Date(t.date + 'T00:00:00');
          const monthKey = `${installmentDate.getFullYear()}-${installmentDate.getMonth()}`;
          
          if (!futureInvoices.has(monthKey)) {
            futureInvoices.set(monthKey, {
              month: installmentDate.getMonth(),
              year: installmentDate.getFullYear(),
              amount: 0,
              installments: []
            });
          }
          
          const invoice = futureInvoices.get(monthKey);
          invoice.amount += parseFloat(t.amount);
          invoice.installments.push(t);
        });
      
      // Adicionar recorrentes projetadas para os próximos 12 meses
      for (let i = 1; i <= 12; i++) {
        const futureMonth = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const projectedRecurrings = getProjectedRecurringTransactions(futureMonth.getMonth(), futureMonth.getFullYear());
        
        projectedRecurrings
          .filter(t => t.card_id === cardId && t.type === 'despesa' && t.payment_method === 'credito')
          .forEach(t => {
            const installmentDate = new Date(t.date + 'T00:00:00');
            const monthKey = `${installmentDate.getFullYear()}-${installmentDate.getMonth()}`;
            
            if (!futureInvoices.has(monthKey)) {
              futureInvoices.set(monthKey, {
                month: installmentDate.getMonth(),
                year: installmentDate.getFullYear(),
                amount: 0,
                installments: []
              });
            }
            
            const invoice = futureInvoices.get(monthKey);
            invoice.amount += parseFloat(t.amount);
            invoice.installments.push(t);
          });
      }

      return Array.from(futureInvoices.values()).sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        return a.month - b.month;
      });
    }

    function renderCards() {
      const container = document.getElementById('cardsList');

      if (cards.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-center py-8 col-span-2">Nenhum cartão cadastrado</p>';
        return;
      }

      const creditCards = cards.filter(c => c.type === 'credito');
      const debitCards = cards.filter(c => c.type === 'debito');

      let html = '';

      if (creditCards.length > 0) {
        html += '<div class="col-span-full"><h3 class="text-2xl font-bold mb-6 text-yellow-500">💳 Cartões de Crédito</h3></div>';
        html += creditCards.map(card => {
          return `<div class="col-span-full">${renderCreditCard(card)}</div>`;
        }).join('');
      }

      if (debitCards.length > 0) {
        html += '<div class="col-span-full"><h3 class="text-2xl font-bold mb-6 mt-8 text-green-500">💳 Cartões de Débito</h3></div>';
        html += debitCards.map(card => renderDebitCard(card)).join('');
      }

      container.innerHTML = html;
    }

    function renderCreditCard(card) {
      const used = calculateCardUsage(card.id);
      const currentMonthInvoice = calculateCurrentMonthInvoice(card.id);
      const available = card.credit_limit - used;
      const usagePercent = (used / card.credit_limit) * 100;
      const futureInvoices = calculateFutureInvoices(card.id);

      return `
        <div class="stat-card border-l-4 border-l-green-500">
          <div class="mb-4">
            <h3 class="text-lg font-semibold text-white mb-1">${card.name}</h3>
            <p class="text-xs text-gray-500">**** **** **** ${card.last_four || '****'}</p>
          </div>

          <div class="space-y-3 mb-4">
            <div class="flex items-center justify-between">
              <span class="text-xs text-gray-400">Fatura Atual</span>
              <span class="text-sm font-semibold ${currentMonthInvoice > 0 ? 'text-yellow-500' : 'text-gray-500'}">${formatCurrency(currentMonthInvoice)}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-xs text-gray-400">Limite Disponível</span>
              <span class="text-sm font-semibold text-green-500">${formatCurrency(available)}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-xs text-gray-400">Utilização</span>
              <span class="text-sm font-semibold text-gray-300">${usagePercent.toFixed(1)}%</span>
            </div>
          </div>

          <div class="progress-bar mb-3">
            <div class="progress-fill" style="width: ${usagePercent}%; background: ${usagePercent > 80 ? 'linear-gradient(90deg, #ef4444, #dc2626)' : 'linear-gradient(90deg, #10b981, #059669)'}"></div>
          </div>

          <div class="flex items-center justify-between text-xs text-gray-500 mb-4">
            <span>Fecha: dia ${card.closing_day}</span>
            <span>Vence: dia ${card.due_day}</span>
          </div>

          <div class="flex gap-2">
            ${currentMonthInvoice > 0 ? `
              <button onclick="payCardInvoice(${card.id}, ${currentMonthInvoice}, 'current')" class="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold py-2 px-3 rounded-lg transition-colors duration-200">
                💰 Pagar
              </button>
            ` : ''}
            
            ${futureInvoices.length > 0 ? `
              <button onclick="showFutureInvoicesModal(${card.id}, '${card.name}')" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 px-3 rounded-lg transition-colors duration-200">
                📊 Próximas
              </button>
            ` : ''}
            
            <button onclick="deleteCard(${card.id}, '${card.name}')" class="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold py-2 px-3 rounded-lg transition-colors duration-200" title="Excluir cartão">
              🗑️
            </button>
          </div>
        </div>
      `;
    }

    function renderDebitCard(card) {
      const balance = calculateDebitCardBalance(card.id);
      const balanceColor = balance >= 0 ? 'text-green-500' : 'text-red-500';
      
      return `
        <div class="stat-card">
          <div class="flex items-center justify-between mb-4">
            <span class="text-xs text-gray-400 uppercase tracking-wider">${card.type}</span>
            <svg width="32" height="24" viewBox="0 0 32 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="1" y="1" width="30" height="22" rx="3" stroke="#10b981" stroke-width="2"/>
              <path d="M1 8H31" stroke="#10b981" stroke-width="2"/>
              <circle cx="8" cy="15" r="2" fill="#10b981"/>
            </svg>
          </div>
          
          <h3 class="text-xl font-bold mb-2">${card.name}</h3>
          <p class="text-sm text-gray-400 mb-4">**** **** **** ${card.last_four || '****'}</p>
          
          <div class="mt-4 pt-4 border-t border-gray-700">
            <div class="flex items-center justify-between mb-4">
              <span class="text-sm text-gray-400">Saldo do Cartão</span>
              <span class="text-xl font-bold ${balanceColor}">${formatCurrency(balance)}</span>
            </div>
            <button onclick="deleteCard(${card.id}, '${card.name}')" class="w-full bg-red-600 hover:bg-red-700 text-white text-xs font-semibold py-2 px-3 rounded-lg transition-colors duration-200">
              🗑️ Excluir Cartão
            </button>
          </div>
        </div>
      `;
    }

    function renderGoals() {
      const container = document.getElementById('goalsList');

      if (goals.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-center py-8">Nenhuma meta cadastrada</p>';
        return;
      }

      container.innerHTML = goals.map(goal => {
        const progress = (goal.current_amount / goal.target_amount) * 100;
        const isCompleted = goal.current_amount >= goal.target_amount;
        const remaining = goal.target_amount - goal.current_amount;

        return `
          <div class="stat-card ${isCompleted ? 'border-green-500' : ''} mb-4">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-xl font-bold">${goal.name}</h3>
              <div class="flex gap-2">
                ${isCompleted ? `
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="10" fill="#10b981"/>
                    <path d="M8 12L11 15L16 9" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                ` : ''}
                <button onclick="deleteGoal(${goal.id}, '${goal.name}')" class="text-red-500 hover:text-red-400 text-xl" title="Excluir meta">×</button>
              </div>
            </div>

            <div class="mb-4">
              <div class="flex items-center justify-between text-sm mb-2">
                <span class="text-gray-400">Progresso</span>
                <span class="font-bold text-green-500">${progress.toFixed(0)}%</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${Math.min(progress, 100)}%"></div>
              </div>
              <div class="flex items-center justify-between text-sm mt-2">
                <span class="text-gray-400">${formatCurrency(goal.current_amount)}</span>
                <span class="text-gray-400">${formatCurrency(goal.target_amount)}</span>
              </div>
              ${!isCompleted ? `
                <p class="text-xs text-gray-500 mt-2">Faltam: ${formatCurrency(remaining)}</p>
              ` : ''}
            </div>

            ${goal.deadline ? `
              <p class="text-sm text-gray-400 mb-4">
                <svg class="inline-block mr-1" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" stroke-width="1.5"/>
                  <path d="M2 6H14M5 1V3M11 1V3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                Meta: ${formatDate(goal.deadline)}
              </p>
            ` : ''}

            <div class="flex gap-2">
              <button onclick="addGoalAmount(${goal.id}, '${goal.name}')" class="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold py-2 px-3 rounded-lg transition-colors duration-200">
                ➕ Adicionar
              </button>
              <button onclick="withdrawGoalAmount(${goal.id}, '${goal.name}')" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 px-3 rounded-lg transition-colors duration-200">
                ➖ Retirar
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    function renderGoalsPreview() {
      const container = document.getElementById('goalsPreview');
      const preview = goals.slice(0, 3);

      if (preview.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-center py-4">Nenhuma meta cadastrada</p>';
        return;
      }

      container.innerHTML = preview.map(goal => {
        const progress = (goal.current_amount / goal.target_amount) * 100;

        return `
          <div class="mb-4 last:mb-0">
            <div class="flex items-center justify-between mb-2">
              <span class="font-semibold">${goal.name}</span>
              <span class="text-sm text-green-500">${progress.toFixed(0)}%</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${Math.min(progress, 100)}%"></div>
            </div>
          </div>
        `;
      }).join('');
    }

    function renderAchievements() {
      const container = document.getElementById('achievementsList');

      const achievements = [
        { id: 1, name: 'Primeira Transação', description: 'Registre sua primeira transação', unlocked: transactions.length >= 1, icon: '💰' },
        { id: 2, name: 'Organizador', description: 'Registre 10 transações', unlocked: transactions.length >= 10, icon: '📊' },
        { id: 3, name: 'Disciplinado', description: 'Registre 50 transações', unlocked: transactions.length >= 50, icon: '💪' },
        { id: 4, name: 'Carteirinha', description: 'Cadastre seu primeiro cartão', unlocked: cards.length >= 1, icon: '💳' },
        { id: 5, name: 'Sonhador', description: 'Crie sua primeira meta', unlocked: goals.length >= 1, icon: '🎯' },
        { id: 6, name: 'Realizador', description: 'Complete uma meta', unlocked: goals.some(g => g.current_amount >= g.target_amount), icon: '🏆' },
        { id: 7, name: 'No Azul', description: 'Tenha saldo positivo no mês', unlocked: checkPositiveBalance(), icon: '💰' },
        { id: 8, name: 'Investidor', description: 'Registre uma receita de investimento', unlocked: transactions.some(t => t.category === 'Investimento'), icon: '📈' }
      ];

      container.innerHTML = achievements.map(ach => `
        <div class="achievement ${ach.unlocked ? 'unlocked' : ''}">
          <div class="text-4xl">${ach.unlocked ? ach.icon : '🔒'}</div>
          <div class="flex-1">
            <h4 class="font-bold ${ach.unlocked ? 'text-green-500' : 'text-gray-500'}" style="color: ${ach.unlocked ? '#10b981' : '#7f8c8d'};">${ach.name}</h4>
            <p class="text-sm text-gray-400" style="color: #7f8c8d;">${ach.description}</p>
          </div>
          ${ach.unlocked ? `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" fill="#10b981"/>
              <path d="M8 12L11 15L16 9" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          ` : ''}
        </div>
      `).join('');
    }

    function checkPositiveBalance() {
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      const monthTransactions = transactions.filter(t => {
        const tDate = new Date(t.date + 'T00:00:00');
        return tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear;
      });

      const income = monthTransactions.filter(t => t.type === 'receita').reduce((sum, t) => sum + parseFloat(t.amount), 0);
      const expenses = monthTransactions.filter(t => t.type === 'despesa' && t.payment_method !== 'credito').reduce((sum, t) => sum + parseFloat(t.amount), 0);

      return income > expenses;
    }

    function changeMonth(delta) {
      currentViewDate = new Date(currentViewDate.getFullYear(), currentViewDate.getMonth() + delta, 1);
      updateUI();
    }

    function backToCurrentMonth() {
      currentViewDate = new Date();
      updateUI();
    }

    function updateMonthLabels() {
      const now = new Date();
      const isCurrentMonth = currentViewDate.getMonth() === now.getMonth() && 
                             currentViewDate.getFullYear() === now.getFullYear();
      
      const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                          'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
      
      const monthLabel = `${monthNames[currentViewDate.getMonth()]} ${currentViewDate.getFullYear()}`;

      const dashboardLabel = document.getElementById('currentMonthLabel');
      if (dashboardLabel) dashboardLabel.textContent = monthLabel;

      const transactionsLabel = document.getElementById('transactionsMonthLabel');
      if (transactionsLabel) transactionsLabel.textContent = monthLabel;

      const backBtn = document.getElementById('backToCurrentBtn');
      const backBtn2 = document.getElementById('backToCurrentBtn2');
      
      if (backBtn) {
        backBtn.style.display = isCurrentMonth ? 'none' : 'flex';
      }
      if (backBtn2) {
        backBtn2.style.display = isCurrentMonth ? 'none' : 'flex';
      }
    }

    function renderCategories() {
      const container = document.getElementById('categoriesList');

      if (categories.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-center py-8 col-span-2" style="color: #7f8c8d;">Nenhuma categoria cadastrada</p>';
        return;
      }

      const incomeCategories = categories.filter(c => c.type === 'receita');
      const expenseCategories = categories.filter(c => c.type === 'despesa');

      container.innerHTML = `
        <div>
          <h3 class="text-lg font-bold mb-3 text-green-500">Receitas</h3>
          ${incomeCategories.map(cat => `
            <div class="category-item mb-2">
              <div class="flex items-center gap-2">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M10 15V5M10 5L5 10M10 5L15 10" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span class="font-semibold category-name">${cat.name}</span>
              </div>
              <button onclick="deleteCategory(${cat.id}, '${cat.name}')" class="text-red-500 hover:text-red-400 transition p-2 hover:bg-red-900 hover:bg-opacity-20 rounded" title="Excluir categoria">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 4H15M13 4V14C13 14.5523 12.5523 15 12 15H6C5.44772 15 5 14.5523 5 14V4M7 4V3C7 2.44772 7.44772 2 8 2H10C10.5523 2 11 2.44772 11 3V4M7 8V12M11 8V12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
          `).join('')}
        </div>
        <div>
          <h3 class="text-lg font-bold mb-3 text-red-500">Despesas</h3>
          ${expenseCategories.map(cat => `
            <div class="category-item mb-2">
              <div class="flex items-center gap-2">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M10 5V15M10 15L15 10M10 15L5 10" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span class="font-semibold category-name">${cat.name}</span>
              </div>
              <button onclick="deleteCategory(${cat.id}, '${cat.name}')" class="text-red-500 hover:text-red-400 transition p-2 hover:bg-red-900 hover:bg-opacity-20 rounded" title="Excluir categoria">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 4H15M13 4V14C13 14.5523 12.5523 15 12 15H6C5.44772 15 5 14.5523 5 14V4M7 4V3C7 2.44772 7.44772 2 8 2H10C10.5523 2 11 2.44772 11 3V4M7 8V12M11 8V12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
          `).join('')}
        </div>
      `;
    }

    function renderRecurringTransactions(filter = 'all') {
      const container = document.getElementById('recurringList');
      
      let filtered = recurringTransactions;
      if (filter === 'permanent') {
        filtered = recurringTransactions.filter(r => r.duration_type === 'permanent');
      } else if (filter === 'temporary') {
        filtered = recurringTransactions.filter(r => r.duration_type === 'temporary');
      }

      if (filtered.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-center py-8">Nenhuma transação recorrente cadastrada</p>';
        return;
      }

      container.innerHTML = filtered.map(r => {
        const isIncome = r.type === 'receita';
        const color = isIncome ? 'text-green-500' : 'text-red-500';
        const icon = isIncome ? '↑' : '↓';
        const isPermanent = r.duration_type === 'permanent';
        
        let expirationInfo = '';
        if (!isPermanent && r.duration_months) {
          const startDate = new Date(r.start_date + 'T00:00:00');
          const today = new Date();
          
          const monthsPassed = (today.getFullYear() - startDate.getFullYear()) * 12 + (today.getMonth() - startDate.getMonth());
          const monthsLeft = Math.max(0, r.duration_months - monthsPassed);
          
          expirationInfo = `<span class="text-xs text-yellow-500 ml-2">${monthsLeft} ${monthsLeft === 1 ? 'mês' : 'meses'} restantes</span>`;
        }

        return `
          <div class="stat-card mb-4">
            <div class="flex items-center justify-between">
              <div class="flex-1">
                <div class="flex items-center gap-3 mb-2">
                  <span class="${color} text-2xl font-bold">${icon}</span>
                  <div>
                    <h4 class="font-bold text-lg">${r.description}</h4>
                    <div class="flex items-center gap-2 mt-1">
                      <span class="text-sm text-gray-400">${r.category}</span>
                      <span class="text-sm text-gray-400">•</span>
                      <span class="text-sm text-gray-400">Todo dia ${r.day_of_month}</span>
                      ${isPermanent ? 
                        '<span class="text-xs bg-green-900 text-green-300 px-2 py-1 rounded ml-2">♾️ Permanente</span>' : 
                        '<span class="text-xs bg-yellow-900 text-yellow-300 px-2 py-1 rounded ml-2">⏰ Temporária</span>'}
                      ${expirationInfo}
                    </div>
                  </div>
                </div>
              </div>
              <div class="text-right flex items-center gap-3">
                <p class="${color} text-2xl font-bold">${isIncome ? '+' : '-'} ${formatCurrency(r.amount)}</p>
                <button onclick="deleteRecurring(${r.id}, '${r.description}')" class="text-red-500 hover:text-red-400 transition p-2 hover:bg-red-900 hover:bg-opacity-20 rounded" title="Excluir recorrência">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 5H17M15 5V16C15 16.5523 14.5523 17 14 17H6C5.44772 17 5 16.5523 5 16V5M7 5V4C7 3.44772 7.44772 3 8 3H12C12.5523 3 13 3.44772 13 4V5M8 9V13M12 9V13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    function filterRecurring(filter) {
      renderRecurringTransactions(filter);
    }

    function openRecurringModal() {
      document.getElementById('recurringModal').classList.add('active');
      selectRecurringType('receita');
      selectRecurringDuration('permanent');
      updateRecurringCategoryOptions();
      
      const today = new Date().toISOString().split('T')[0];
      document.getElementById('recurringStartDate').value = today;
    }

    function closeRecurringModal() {
      document.getElementById('recurringModal').classList.remove('active');
      document.getElementById('recurringForm').reset();
      selectRecurringType('receita');
      selectRecurringDuration('permanent');
    }

    function selectRecurringType(type) {
      const btnReceita = document.getElementById('btnReceitaRecurring');
      const btnDespesa = document.getElementById('btnDespesaRecurring');
      const hiddenInput = document.getElementById('recurringType');
      const cardSection = document.getElementById('recurringCardSelectionSection');
      const cardSectionIncome = document.getElementById('recurringCardSelectionSectionIncome');
      
      if (!btnReceita || !btnDespesa || !hiddenInput || !cardSection || !cardSectionIncome) {
        return;
      }
      
      hiddenInput.value = type;
      
      if (type === 'receita') {
        btnReceita.classList.add('btn-income-selected');
        btnReceita.classList.remove('btn-recurring-type');
        
        btnDespesa.classList.remove('btn-expense-selected');
        btnDespesa.classList.add('btn-recurring-type');
        
        cardSectionIncome.style.display = 'block';
        updateRecurringIncomeCardOptions();
        
        cardSection.style.display = 'none';
      } else {
        btnDespesa.classList.add('btn-expense-selected');
        btnDespesa.classList.remove('btn-recurring-type');
        
        btnReceita.classList.remove('btn-income-selected');
        btnReceita.classList.add('btn-recurring-type');
        
        cardSectionIncome.style.display = 'none';
        
        cardSection.style.display = 'block';
        updateRecurringCardOptions();
      }
      
      updateRecurringCategoryOptions();
      
      // Aplicar estilos dinâmicos baseado no tema atual
      if (document.documentElement.getAttribute('data-theme') === 'light') {
        applyLightTheme();
      } else {
        applyDarkTheme();
      }
    }

    function selectRecurringDuration(durationType) {
      const btnPermanent = document.getElementById('btnPermanent');
      const btnTemporary = document.getElementById('btnTemporary');
      const hiddenInput = document.getElementById('recurringDuration');
      const monthsSection = document.getElementById('durationMonthsSection');
      
      hiddenInput.value = durationType;
      
      if (durationType === 'permanent') {
        btnPermanent.classList.add('btn-permanent-selected');
        btnPermanent.classList.remove('btn-duration');
        
        btnTemporary.classList.remove('btn-permanent-selected');
        btnTemporary.classList.add('btn-duration');
        
        monthsSection.style.display = 'none';
      } else {
        btnTemporary.classList.add('btn-permanent-selected');
        btnTemporary.classList.remove('btn-duration');
        
        btnPermanent.classList.remove('btn-permanent-selected');
        btnPermanent.classList.add('btn-duration');
        
        monthsSection.style.display = 'block';
      }
    }

    function updateRecurringCategoryOptions() {
      const select = document.getElementById('recurringCategory');
      const type = document.getElementById('recurringType').value;
      
      const filteredCategories = categories.filter(c => c.type === type);

      select.innerHTML = filteredCategories.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    }

    function updateRecurringCardOptions() {
      const select = document.getElementById('recurringCardSelection');
      
      select.innerHTML = '<option value="">Selecione um cartão</option>' +
        cards.map(c => {
          const typeLabel = c.type === 'credito' ? '💳 Crédito' : '💳 Débito';
          let infoLabel = '';
          
          if (c.type === 'credito') {
            const used = calculateCardUsage(c.id);
            const available = c.credit_limit - used;
            infoLabel = ` - Disponível: ${formatCurrency(available)}`;
          } else {
            const balance = calculateDebitCardBalance(c.id);
            infoLabel = ` - Saldo: ${formatCurrency(balance)}`;
          }
          
          return `<option value="${c.id}">${c.name} ${typeLabel}${infoLabel}</option>`;
        }).join('');
    }

    function updateRecurringIncomeCardOptions() {
      const select = document.getElementById('recurringCardSelectionIncome');
      
      const debitCards = cards.filter(c => c.type === 'debito');
      
      select.innerHTML = '<option value="">Nenhum (dinheiro/outro)</option>' +
        debitCards.map(c => {
          const balance = calculateDebitCardBalance(c.id);
          return `<option value="${c.id}">${c.name} 🏦 - Saldo atual: ${formatCurrency(balance)}</option>`;
        }).join('');
    }

    async function saveRecurring(e) {
      e.preventDefault();
      
      // Evitar múltiplos cliques
      const submitBtn = e.target.querySelector('button[type="submit"]');
      if (submitBtn.disabled) return;
      
      submitBtn.disabled = true;
      const originalText = submitBtn.textContent;
      submitBtn.textContent = 'Salvando...';
      
      const formData = new FormData(e.target);
      const type = formData.get('type');
      
      const durationMonthsValue = formData.get('duration_months');
      const durationMonths = durationMonthsValue && durationMonthsValue !== '' ? parseInt(durationMonthsValue) : null;
      
      // Armazenar card_id no localStorage para usar ao criar transações
      let cardId = null;
      if (type === 'receita') {
        const cardIdIncome = formData.get('card_id_income');
        cardId = cardIdIncome && cardIdIncome !== '' ? parseInt(cardIdIncome) : null;
      } else {
        const cardIdExpense = formData.get('card_id');
        cardId = cardIdExpense && cardIdExpense !== '' ? parseInt(cardIdExpense) : null;
      }
      
      const description = formData.get('description');
      
      const data = {
        type: type,
        description: description,
        amount: parseFloat(formData.get('amount')),
        category: formData.get('category'),
        day_of_month: parseInt(formData.get('day_of_month')),
        duration_type: formData.get('duration_type'),
        duration_months: durationMonths,
        start_date: formData.get('start_date'),
        is_active: true,
        user_id: currentUser.id
      };

      try {
        const { error, data: insertedData } = await supabaseClient.from('recurring_transactions').insert([data]).select();
        
        if (error) {
          console.error('Erro detalhado:', error);
          throw error;
        }

        // Salvar card_id em localStorage se existir
        if (cardId && insertedData && insertedData.length > 0) {
          const recurringId = insertedData[0].id;
          const cardMappings = JSON.parse(localStorage.getItem('recurring_card_mappings') || '{}');
          cardMappings[recurringId] = cardId;
          localStorage.setItem('recurring_card_mappings', JSON.stringify(cardMappings));
        }

        showToast('Transação recorrente cadastrada com sucesso!', 'success');
        closeRecurringModal();
        await loadData();
        updateUI();
      } catch (error) {
        console.error('Error saving recurring transaction:', error);
        showToast('Erro ao cadastrar transação recorrente. Verifique os dados e tente novamente.', 'error');
        
        // Reabilitar botão em caso de erro
        const form = document.getElementById('recurringForm');
        const submitBtn = form ? form.querySelector('button[type="submit"]') : null;
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Salvar';
        }
      }
    }

    async function deleteTransaction(transactionId, description, installments, currentInstallment) {
      const transaction = transactions.find(t => t.id === transactionId);
      
      if (!transaction) {
        showToast('Transação não encontrada.', 'error');
        return;
      }

      // Se for uma compra parcelada, pergunta se quer excluir só essa ou todas
      if (installments > 1) {
        const confirmDiv = document.createElement('div');
        confirmDiv.className = 'modal active';
        confirmDiv.innerHTML = `
          <div class="modal-content max-w-md">
            <h3 class="text-xl font-bold mb-4 text-yellow-500">⚠️ Compra Parcelada</h3>
            <p class="text-gray-400 mb-6">Esta é a parcela <strong>${currentInstallment}/${installments}</strong> de "<strong>${description}</strong>".<br><br>O que você deseja excluir?</p>
            <div class="flex flex-col gap-3">
              <button class="btn-primary" onclick="confirmDeleteSingleInstallment(${transactionId})">
                Apenas esta parcela (${currentInstallment}/${installments})
              </button>
              <button class="btn-primary" style="background: #ef4444;" onclick="confirmDeleteAllInstallments(${transactionId}, '${description.replace(/'/g, "\\'")}', ${installments}, ${transaction.amount})">
                Todas as parcelas relacionadas
              </button>
              <button class="btn-secondary" onclick="this.closest('.modal').remove()">Cancelar</button>
            </div>
          </div>
        `;
        document.body.appendChild(confirmDiv);
      } else {
        // Transação única - confirmação simples
        const confirmDiv = document.createElement('div');
        confirmDiv.className = 'modal active';
        confirmDiv.innerHTML = `
          <div class="modal-content max-w-md">
            <h3 class="text-xl font-bold mb-4 text-red-500">Excluir Transação</h3>
            <p class="text-gray-400 mb-6">Tem certeza que deseja excluir a transação "<strong>${description}</strong>"?<br><br>Valor: <strong>${formatCurrency(transaction.amount)}</strong></p>
            <div class="flex gap-3">
              <button class="btn-primary" style="background: #ef4444;" onclick="confirmDeleteSingleInstallment(${transactionId})">Sim, excluir</button>
              <button class="btn-secondary" onclick="this.closest('.modal').remove()">Cancelar</button>
            </div>
          </div>
        `;
        document.body.appendChild(confirmDiv);
      }
    }

    async function confirmDeleteSingleInstallment(transactionId) {
      try {
        // Evitar múltiplos cliques - desabilitar o botão
        const modal = document.querySelector('.modal.active');
        const deleteBtn = modal ? modal.querySelector('button[style*="background: #ef4444"]') : null;
        if (deleteBtn) {
          deleteBtn.disabled = true;
          deleteBtn.textContent = 'Excluindo...';
        }
        
        const { error } = await supabaseClient
          .from('transactions')
          .delete()
          .eq('id', transactionId);
        
        if (error) throw error;

        showToast('Transação excluída com sucesso!', 'success');
        document.querySelector('.modal.active').remove();
        await loadData();
        updateUI();
      } catch (error) {
        console.error('Error deleting transaction:', error);
        showToast('Erro ao excluir transação. Tente novamente.', 'error');
        
        // Reabilitar botão em caso de erro
        const modal = document.querySelector('.modal.active');
        const deleteBtn = modal ? modal.querySelector('button[style*="background: #ef4444"]') : null;
        if (deleteBtn) {
          deleteBtn.disabled = false;
          deleteBtn.textContent = 'Sim, excluir';
        }
      }
    }

    async function confirmDeleteAllInstallments(transactionId, description, totalInstallments, installmentAmount) {
      try {
        // Evitar múltiplos cliques - desabilitar o botão
        const modal = document.querySelector('.modal.active');
        const deleteBtn = modal ? modal.querySelector('button[style*="background: #ef4444"]') : null;
        if (deleteBtn) {
          deleteBtn.disabled = true;
          deleteBtn.textContent = 'Excluindo...';
        }
        
        // Busca todas as transações relacionadas (mesma descrição, valor e total de parcelas)
        const relatedTransactions = transactions.filter(t => 
          t.description === description &&
          t.installments === totalInstallments &&
          parseFloat(t.amount) === parseFloat(installmentAmount)
        );

        // Exclui todas as parcelas relacionadas
        for (const transaction of relatedTransactions) {
          const { error } = await supabaseClient
            .from('transactions')
            .delete()
            .eq('id', transaction.id);
          
          if (error) throw error;
        }

        showToast(`Todas as ${relatedTransactions.length} parcelas foram excluídas!`, 'success');
        document.querySelector('.modal.active').remove();
        await loadData();
        updateUI();
      } catch (error) {
        console.error('Error deleting installments:', error);
        showToast('Erro ao excluir parcelas. Tente novamente.', 'error');
        
        // Reabilitar botão em caso de erro
        const modal = document.querySelector('.modal.active');
        const deleteBtn = modal ? modal.querySelector('button[style*="background: #ef4444"]') : null;
        if (deleteBtn) {
          deleteBtn.disabled = false;
          deleteBtn.textContent = 'Todas as parcelas relacionadas';
        }
      }
    }

    async function deleteRecurring(recurringId, description) {
      const confirmDiv = document.createElement('div');
      confirmDiv.className = 'modal active';
      confirmDiv.innerHTML = `
        <div class="modal-content max-w-md">
          <h3 class="text-xl font-bold mb-4 text-red-500">Excluir Recorrência</h3>
          <p class="text-gray-400 mb-6">Tem certeza que deseja excluir a recorrência "<strong>${description}</strong>"?<br><br>
          <strong class="text-yellow-400">⚠️ Importante:</strong><br>
          • As transações já criadas não serão afetadas<br>
          • A partir de agora, novas transações desta recorrência não serão mais criadas automaticamente</p>
          <div class="flex gap-3">
            <button class="btn-primary" style="background: #ef4444;" onclick="confirmDeleteRecurring(${recurringId})">Sim, excluir</button>
            <button class="btn-secondary" onclick="this.closest('.modal').remove()">Cancelar</button>
          </div>
        </div>
      `;
      document.body.appendChild(confirmDiv);
    }

    async function confirmDeleteRecurring(recurringId) {
      try {
        // Evitar múltiplos cliques - desabilitar o botão
        const modal = document.querySelector('.modal.active');
        const deleteBtn = modal ? modal.querySelector('button[style*="background: #ef4444"]') : null;
        if (deleteBtn) {
          deleteBtn.disabled = true;
          deleteBtn.textContent = 'Excluindo...';
        }
        
        const { error } = await supabaseClient
          .from('recurring_transactions')
          .delete()
          .eq('id', recurringId);
        
        if (error) throw error;

        showToast('Recorrência excluída com sucesso!', 'success');
        document.querySelector('.modal.active').remove();
        await loadData();
        updateUI();
      } catch (error) {
        console.error('Error deleting recurring transaction:', error);
        showToast('Erro ao excluir recorrência. Tente novamente.', 'error');
        
        // Reabilitar botão em caso de erro
        const modal = document.querySelector('.modal.active');
        const deleteBtn = modal ? modal.querySelector('button[style*="background: #ef4444"]') : null;
        if (deleteBtn) {
          deleteBtn.disabled = false;
          deleteBtn.textContent = 'Sim, excluir';
        }
      }
    }

    function filterTransactions(filter) {
      renderTransactions(filter);
    }

    function openTransactionModal() {
      if (cards.length === 0) {
        const confirmDiv = document.createElement('div');
        confirmDiv.className = 'modal active';
        confirmDiv.innerHTML = `
          <div class="modal-content max-w-md">
            <h3 class="text-xl font-bold mb-4 text-yellow-500">⚠️ Nenhum Cartão Cadastrado</h3>
            <p class="text-gray-400 mb-6">Você precisa cadastrar pelo menos um cartão antes de criar transações. Deseja cadastrar um cartão agora?</p>
            <div class="flex gap-3">
              <button class="btn-primary" onclick="this.closest('.modal').remove(); openCardModal();">
                <svg class="inline-block mr-2" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 3V13M3 8H13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
                Cadastrar Cartão
              </button>
              <button class="btn-secondary" onclick="this.closest('.modal').remove()">Agora Não</button>
            </div>
          </div>
        `;
        document.body.appendChild(confirmDiv);
        return;
      }
      
      document.getElementById('transactionModal').classList.add('active');
      selectTransactionType('receita');
    }

    function closeTransactionModal() {
      document.getElementById('transactionModal').classList.remove('active');
      document.getElementById('transactionForm').reset();
      setDefaultDate();
      const btnReceita = document.getElementById('btnReceita');
      const btnDespesa = document.getElementById('btnDespesa');
      if (btnReceita && btnDespesa) {
        selectTransactionType('receita');
      }
    }

    function selectTransactionType(type) {
      const btnReceita = document.getElementById('btnReceita');
      const btnDespesa = document.getElementById('btnDespesa');
      const hiddenInput = document.getElementById('transactionType');
      const cardSection = document.getElementById('cardSelectionSection');
      const cardSectionIncome = document.getElementById('cardSelectionSectionIncome');
      const installmentsSection = document.getElementById('installmentsSection');
      
      if (!btnReceita || !btnDespesa || !hiddenInput || !cardSection || !cardSectionIncome || !installmentsSection) {
        return;
      }
      
      hiddenInput.value = type;
      
      if (type === 'receita') {
        btnReceita.classList.add('btn-income-selected');
        btnReceita.classList.remove('btn-transaction-type');
        
        btnDespesa.classList.remove('btn-expense-selected');
        btnDespesa.classList.add('btn-transaction-type');
        
        cardSectionIncome.style.display = 'block';
        updateIncomeCardOptions();
        
        cardSection.style.display = 'none';
        installmentsSection.style.display = 'none';
      } else {
        btnDespesa.classList.add('btn-expense-selected');
        btnDespesa.classList.remove('btn-transaction-type');
        
        btnReceita.classList.remove('btn-income-selected');
        btnReceita.classList.add('btn-transaction-type');
        
        cardSectionIncome.style.display = 'none';
        
        cardSection.style.display = 'block';
        updateCardSelectionOptions();
      }
      
      updateCategoryOptions();
      
      // Aplicar estilos dinâmicos baseado no tema atual
      if (document.documentElement.getAttribute('data-theme') === 'light') {
        applyLightTheme();
      } else {
        applyDarkTheme();
      }
    }

    function toggleCardFields() {
      const type = document.getElementById('transactionType').value;
      selectTransactionType(type);
    }

    function toggleCardSelection() {
      const cardSelect = document.getElementById('cardSelection');
      const selectedCardId = cardSelect.value;
      const installmentsSection = document.getElementById('installmentsSection');
      
      if (!selectedCardId) {
        installmentsSection.style.display = 'none';
        return;
      }
      
      const selectedCard = cards.find(c => c.id === parseInt(selectedCardId));
      
      if (selectedCard && selectedCard.type === 'credito') {
        installmentsSection.style.display = 'block';
        updateInstallmentSimulation();
      } else {
        installmentsSection.style.display = 'none';
      }
    }

    function updateInstallmentSimulation() {
      const amountField = document.getElementById('transactionAmount');
      const installmentsSelect = document.getElementById('installments');
      const enableInterestCheckbox = document.getElementById('enableInterest');
      const interestRateField = document.getElementById('interestRate');
      const simulationDiv = document.getElementById('installmentSimulation');
      const interestRateSection = document.getElementById('interestRateSection');
      const totalWithInterestSection = document.getElementById('totalWithInterestSection');

      const amount = parseFloat(amountField.value) || 0;
      const installments = parseInt(installmentsSelect.value) || 1;
      const hasInterest = enableInterestCheckbox.checked;
      const interestRate = parseFloat(interestRateField.value) || 0;

      if (amount > 0 && installments > 1) {
        simulationDiv.style.display = 'block';
      } else {
        simulationDiv.style.display = 'none';
        return;
      }

      if (hasInterest) {
        interestRateSection.style.display = 'block';
        totalWithInterestSection.style.display = 'block';
      } else {
        interestRateSection.style.display = 'none';
        totalWithInterestSection.style.display = 'none';
      }

      let installmentValue, totalWithInterest, totalInterest;

      if (hasInterest && interestRate > 0) {
        const monthlyRate = interestRate / 100;
        const factor = Math.pow(1 + monthlyRate, installments);
        installmentValue = (amount * monthlyRate * factor) / (factor - 1);
        totalWithInterest = installmentValue * installments;
        totalInterest = totalWithInterest - amount;
      } else {
        installmentValue = amount / installments;
        totalWithInterest = amount;
        totalInterest = 0;
      }

      document.getElementById('installmentValue').textContent = formatCurrency(installmentValue);
      
      if (hasInterest && interestRate > 0) {
        document.getElementById('totalWithInterest').textContent = formatCurrency(totalWithInterest);
        document.getElementById('totalInterest').textContent = formatCurrency(totalInterest);
      }

      generateInstallmentSchedule(amount, installments, hasInterest ? interestRate : 0, installmentValue);
    }

    function generateInstallmentSchedule(principal, installments, interestRate, installmentValue) {
      const scheduleDiv = document.getElementById('installmentSchedule');
      const cardSelect = document.getElementById('cardSelection');
      const selectedCardId = cardSelect.value;
      
      if (!selectedCardId) {
        scheduleDiv.innerHTML = '';
        return;
      }

      const card = cards.find(c => c.id === parseInt(selectedCardId));
      if (!card) {
        scheduleDiv.innerHTML = '';
        return;
      }

      const purchaseDate = new Date(document.getElementById('transactionDate').value + 'T00:00:00');
      const purchaseDay = purchaseDate.getDate();
      
      let firstInstallmentDate = new Date(purchaseDate);
      
      if (purchaseDay > card.closing_day) {
        firstInstallmentDate.setMonth(firstInstallmentDate.getMonth() + 1);
      }

      const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

      let scheduleHTML = '<div class="text-xs font-semibold text-gray-400 mb-2">📅 Cronograma de Pagamento:</div>';
      scheduleHTML += '<div class="space-y-1">';

      let remainingBalance = principal;

      for (let i = 0; i < installments; i++) {
        const installmentDate = new Date(firstInstallmentDate);
        installmentDate.setMonth(installmentDate.getMonth() + i);
        installmentDate.setDate(card.closing_day);

        let interestAmount = 0;
        let principalAmount = installmentValue;

        if (interestRate > 0) {
          interestAmount = remainingBalance * (interestRate / 100);
          principalAmount = installmentValue - interestAmount;
          remainingBalance -= principalAmount;
        }

        const monthLabel = `${monthNames[installmentDate.getMonth()]}/${installmentDate.getFullYear()}`;
        const isFirst = i === 0;

        scheduleHTML += `
          <div class="flex items-center justify-between text-xs py-1 px-2 rounded ${isFirst ? 'bg-green-900 bg-opacity-20' : 'bg-black bg-opacity-20'}">
            <div class="flex items-center gap-2">
              ${isFirst ? '<span class="text-green-500">●</span>' : '<span class="text-gray-600">○</span>'}
              <span class="${isFirst ? 'text-green-400 font-semibold' : 'text-gray-400'}">${i + 1}/${installments}</span>
              <span class="text-gray-500">${monthLabel}</span>
            </div>
            <span class="${isFirst ? 'text-green-500 font-bold' : 'text-gray-300'}">${formatCurrency(installmentValue)}</span>
          </div>
        `;
      }

      scheduleHTML += '</div>';
      scheduleDiv.innerHTML = scheduleHTML;
    }

    function updateCardSelectionOptions() {
      const select = document.getElementById('cardSelection');
      
      select.innerHTML = '<option value="">Selecione um cartão</option>' +
        cards.map(c => {
          const typeLabel = c.type === 'credito' ? '💳 Crédito' : '🏦 Débito';
          let infoLabel = '';
          
          if (c.type === 'credito') {
            const used = calculateCardUsage(c.id);
            const available = c.credit_limit - used;
            infoLabel = ` - Disponível: ${formatCurrency(available)}`;
          } else {
            const balance = calculateDebitCardBalance(c.id);
            infoLabel = ` - Saldo: ${formatCurrency(balance)}`;
          }
          
          return `<option value="${c.id}">${c.name} ${typeLabel}${infoLabel}</option>`;
        }).join('');
      
      select.onchange = toggleCardSelection;
    }

    function updateIncomeCardOptions() {
      const select = document.getElementById('cardSelectionIncome');
      
      const debitCards = cards.filter(c => c.type === 'debito');
      
      select.innerHTML = '<option value="">Nenhum (dinheiro/outro)</option>' +
        debitCards.map(c => {
          const balance = calculateDebitCardBalance(c.id);
          return `<option value="${c.id}">${c.name} 💳 - Saldo atual: ${formatCurrency(balance)}</option>`;
        }).join('');
    }

    let calcExpression = '';
    let calcDisplay = '0';
    let calcResult = null;

    function openCalculator() {
      document.getElementById('calculatorModal').classList.add('active');
      calcClear();
      
      // Focar no documento para capturar teclas
      document.addEventListener('keydown', handleCalculatorKeyboard);
    }

    function closeCalculator() {
      document.getElementById('calculatorModal').classList.remove('active');
      document.removeEventListener('keydown', handleCalculatorKeyboard);
    }

    function handleCalculatorKeyboard(e) {
      const modal = document.getElementById('calculatorModal');
      if (!modal.classList.contains('active')) {
        return;
      }

      // Números 0-9
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        calcAppend(e.key);
      }
      // Operadores
      else if (e.key === '+') {
        e.preventDefault();
        calcAppend('+');
      }
      else if (e.key === '-') {
        e.preventDefault();
        calcAppend('-');
      }
      else if (e.key === '*') {
        e.preventDefault();
        calcAppend('*');
      }
      else if (e.key === '/') {
        e.preventDefault();
        calcAppend('/');
      }
      // Ponto/vírgula
      else if (e.key === '.' || e.key === ',') {
        e.preventDefault();
        calcAppend('.');
      }
      // Enter = resultado
      else if (e.key === 'Enter') {
        e.preventDefault();
        calcEquals();
      }
      // Backspace = apagar último dígito
      else if (e.key === 'Backspace') {
        e.preventDefault();
        if (calcDisplay !== '0') {
          calcDisplay = calcDisplay.slice(0, -1) || '0';
          calcExpression = calcExpression.slice(0, -1);
          document.getElementById('calcDisplay').textContent = calcDisplay;
        }
      }
      // Escape = fechar
      else if (e.key === 'Escape') {
        e.preventDefault();
        closeCalculator();
      }
    }

    function calcAppend(value) {
      if (calcDisplay === '0' && value !== '.') {
        calcDisplay = value;
      } else {
        calcDisplay += value;
      }
      calcExpression += value;
      document.getElementById('calcDisplay').textContent = calcDisplay;
      
      const sendBtn = document.getElementById('calcSendBtn');
      if (sendBtn) sendBtn.style.display = 'none';
    }

    function calcClear() {
      calcExpression = '';
      calcDisplay = '0';
      calcResult = null;
      document.getElementById('calcDisplay').textContent = calcDisplay;
      
      const sendBtn = document.getElementById('calcSendBtn');
      if (sendBtn) sendBtn.style.display = 'none';
    }

    function calcEquals() {
      try {
        if (!calcExpression || calcExpression.trim() === '') {
          return;
        }
        
        let expression = calcExpression.replace(/×/g, '*').replace(/÷/g, '/');
        
        const result = new Function('return ' + expression)();
        
        if (isNaN(result) || !isFinite(result)) {
          throw new Error('Resultado inválido');
        }
        
        calcResult = Math.round(result * 100) / 100;
        calcDisplay = calcResult.toString();
        calcExpression = calcResult.toString();
        document.getElementById('calcDisplay').textContent = calcDisplay;
        
        const sendBtn = document.getElementById('calcSendBtn');
        if (sendBtn) sendBtn.style.display = 'block';
        
      } catch (error) {
        calcDisplay = 'Erro';
        calcResult = null;
        document.getElementById('calcDisplay').textContent = calcDisplay;
        
        const sendBtn = document.getElementById('calcSendBtn');
        if (sendBtn) sendBtn.style.display = 'none';
        
        setTimeout(calcClear, 1500);
      }
    }

    function sendCalcResult() {
      if (calcResult === null) return;
      
      const amountField = document.getElementById('transactionAmount');
      if (amountField) {
        amountField.value = calcResult.toFixed(2);
      }
      
      closeCalculator();
      calcClear();
    }

    function updateCategoryOptions() {
      const select = document.getElementById('transactionCategory');
      const type = document.getElementById('transactionType').value;
      
      const filteredCategories = categories.filter(c => c.type === type);

      select.innerHTML = filteredCategories.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    }

    async function saveTransaction(e) {
      e.preventDefault();
      
      // Evitar múltiplos cliques
      const submitBtn = e.target.querySelector('button[type="submit"]');
      if (submitBtn.disabled) return;
      
      submitBtn.disabled = true;
      const originalText = submitBtn.textContent;
      submitBtn.textContent = 'Salvando...';
      
      const formData = new FormData(e.target);
      const type = formData.get('type');
      const description = formData.get('description');
      const totalAmount = parseFloat(formData.get('amount'));
      const category = formData.get('category');
      const purchaseDate = formData.get('date');
      
      let cardId = null;
      if (type === 'receita') {
        cardId = formData.get('card_id_income') ? parseInt(formData.get('card_id_income')) : null;
      } else {
        cardId = formData.get('card_id') ? parseInt(formData.get('card_id')) : null;
      }

      const installments = cardId && type === 'despesa' ? parseInt(formData.get('installments')) || 1 : 1;
      
      let paymentMethod = null;
      
      if (cardId) {
        const card = cards.find(c => c.id === cardId);
        if (card) {
          paymentMethod = card.type;
        }
      }

      try {
        if (paymentMethod === 'credito' && installments > 1 && type === 'despesa') {
          const card = cards.find(c => c.id === cardId);
          const purchaseDateObj = new Date(purchaseDate + 'T00:00:00');
          const purchaseDay = purchaseDateObj.getDate();
          
          let firstInstallmentDate = new Date(purchaseDateObj);
          
          if (purchaseDay > card.closing_day) {
            firstInstallmentDate.setMonth(firstInstallmentDate.getMonth() + 1);
          }

          const enableInterest = document.getElementById('enableInterest').checked;
          const interestRate = enableInterest ? parseFloat(document.getElementById('interestRate').value) || 0 : 0;

          let installmentAmount;
          if (interestRate > 0) {
            const monthlyRate = interestRate / 100;
            const factor = Math.pow(1 + monthlyRate, installments);
            installmentAmount = (totalAmount * monthlyRate * factor) / (factor - 1);
          } else {
            installmentAmount = totalAmount / installments;
          }

          const transactionsToInsert = [];
          
          for (let i = 0; i < installments; i++) {
            const installmentDate = new Date(firstInstallmentDate);
            installmentDate.setMonth(installmentDate.getMonth() + i);
            installmentDate.setDate(card.closing_day);

            transactionsToInsert.push({
              type: type,
              description: description,
              amount: installmentAmount,
              category: category,
              date: installmentDate.toISOString().split('T')[0],
              payment_method: paymentMethod,
              card_id: cardId,
              installments: installments,
              current_installment: i + 1,
              user_id: currentUser.id
            });
          }

          const { error } = await supabaseClient.from('transactions').insert(transactionsToInsert);
          if (error) throw error;

          showToast(`Compra parcelada em ${installments}x cadastrada com sucesso!`, 'success');
        } else {
          const data = {
            type: type,
            description: description,
            amount: totalAmount,
            category: category,
            date: purchaseDate,
            payment_method: paymentMethod,
            card_id: cardId,
            installments: 1,
            current_installment: 1,
            user_id: currentUser.id
          };

          const { error } = await supabaseClient.from('transactions').insert([data]);
          if (error) throw error;

          showToast('Transação cadastrada com sucesso!', 'success');
        }

        closeTransactionModal();
        await loadData();
        updateUI();
      } catch (error) {
        console.error('Error saving transaction:', error);
        showToast('Erro ao cadastrar transação. Tente novamente.', 'error');
        
        // Reabilitar botão em caso de erro
        const form = document.getElementById('transactionForm');
        const submitBtn = form ? form.querySelector('button[type="submit"]') : null;
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Salvar';
        }
      }
    }

    function openCardModal() {
      document.getElementById('cardModal').classList.add('active');
    }

    function closeCardModal() {
      document.getElementById('cardModal').classList.remove('active');
      document.getElementById('cardForm').reset();
    }

    function toggleCreditCardFields() {
      const cardType = document.getElementById('cardType').value;
      const creditCardFields = document.getElementById('creditCardFields');
      
      if (cardType === 'credito') {
        creditCardFields.style.display = 'block';
      } else {
        creditCardFields.style.display = 'none';
      }
    }

    function deleteCard(cardId, cardName) {
      // Verificar se há transações vinculadas ao cartão
      const linkedTransactions = transactions.filter(t => t.card_id === cardId);
      const linkedRecurrings = recurringTransactions.filter(r => {
        const cardMappings = JSON.parse(localStorage.getItem('recurring_card_mappings') || '{}');
        return cardMappings[r.id] === cardId;
      });

      const hasLinkedData = linkedTransactions.length > 0 || linkedRecurrings.length > 0;

      const confirmDiv = document.createElement('div');
      confirmDiv.className = 'modal active';
      confirmDiv.innerHTML = `
        <div class="modal-content max-w-md">
          <h3 class="text-2xl font-bold mb-4 text-red-500">⚠️ Excluir Cartão</h3>
          
          <p class="text-gray-300 mb-4">Tem certeza que deseja excluir o cartão <strong>"${cardName}"</strong>?</p>
          
          ${hasLinkedData ? `
            <div class="bg-red-500 bg-opacity-20 border border-red-500 rounded-lg p-4 mb-4">
              <p class="text-red-400 font-semibold mb-2">⚠️ ATENÇÃO - Dados Vinculados:</p>
              <ul class="text-sm text-red-300 space-y-1">
                ${linkedTransactions.length > 0 ? `
                  <li>• <strong>${linkedTransactions.length}</strong> transação(ões) será(ão) deletada(s)</li>
                ` : ''}
                ${linkedRecurrings.length > 0 ? `
                  <li>• <strong>${linkedRecurrings.length}</strong> recorrência(s) será(ão) deletada(s)</li>
                ` : ''}
              </ul>
              <p class="text-red-300 text-xs mt-3">Todos os dados vinculados a este cartão serão removidos permanentemente e não poderão ser recuperados.</p>
            </div>
          ` : ''}
          
          <div class="flex gap-3">
            <button class="flex-1 btn-secondary" onclick="this.closest('.modal').remove()">Cancelar</button>
            <button class="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors" onclick="confirmDeleteCard(${cardId})">Confirmar Exclusão</button>
          </div>
        </div>
      `;
      document.body.appendChild(confirmDiv);
    }

    async function confirmDeleteCard(cardId) {
      try {
        // Evitar múltiplos cliques - desabilitar o botão
        const modal = document.querySelector('.modal.active');
        const deleteBtn = modal ? modal.querySelector('button:not(.btn-secondary)') : null;
        if (deleteBtn && deleteBtn.textContent.includes('Confirmar')) {
          deleteBtn.disabled = true;
          deleteBtn.textContent = 'Excluindo...';
        }
        
        // Deletar todas as transações vinculadas
        const linkedTransactions = transactions.filter(t => t.card_id === cardId);
        for (const transaction of linkedTransactions) {
          await supabaseClient.from('transactions').delete().eq('id', transaction.id);
        }

        // Deletar todas as recorrências vinculadas
        const cardMappings = JSON.parse(localStorage.getItem('recurring_card_mappings') || '{}');
        const linkedRecurrings = recurringTransactions.filter(r => cardMappings[r.id] === cardId);
        for (const recurring of linkedRecurrings) {
          await supabaseClient.from('recurring_transactions').delete().eq('id', recurring.id);
          delete cardMappings[recurring.id];
        }
        localStorage.setItem('recurring_card_mappings', JSON.stringify(cardMappings));

        // Deletar o cartão
        await supabaseClient.from('cards').delete().eq('id', cardId);

        showToast('Cartão e todos os dados vinculados foram deletados com sucesso!', 'success');
        document.querySelector('.modal.active').remove();
        await loadData();
        updateUI();
      } catch (error) {
        console.error('Error deleting card:', error);
        showToast('Erro ao deletar cartão. Tente novamente.', 'error');
        
        // Reabilitar botão em caso de erro
        const modal = document.querySelector('.modal.active');
        const deleteBtn = modal ? modal.querySelector('button:not(.btn-secondary)') : null;
        if (deleteBtn && deleteBtn.textContent === 'Excluindo...') {
          deleteBtn.disabled = false;
          deleteBtn.textContent = 'Confirmar Exclusão';
        }
      }
    }

    async function saveCard(e) {
      e.preventDefault();
      
      // Evitar múltiplos cliques
      const submitBtn = e.target.querySelector('button[type="submit"]');
      if (submitBtn.disabled) return;
      
      submitBtn.disabled = true;
      const originalText = submitBtn.textContent;
      submitBtn.textContent = 'Salvando...';
      
      const formData = new FormData(e.target);
      const data = {
        name: formData.get('name'),
        type: formData.get('type'),
        last_four: formData.get('last_four'),
        credit_limit: formData.get('credit_limit') ? parseFloat(formData.get('credit_limit')) : null,
        closing_day: formData.get('closing_day') ? parseInt(formData.get('closing_day')) : null,
        due_day: formData.get('due_day') ? parseInt(formData.get('due_day')) : null,
        user_id: currentUser.id
      };

      try {
        const { error } = await supabaseClient.from('cards').insert([data]);
        
        if (error) throw error;

        showToast('Cartão cadastrado com sucesso!', 'success');
        closeCardModal();
        await loadData();
        updateUI();
      } catch (error) {
        console.error('Error saving card:', error);
        showToast('Erro ao cadastrar cartão. Tente novamente.', 'error');
        
        // Reabilitar botão em caso de erro
        const form = document.getElementById('cardForm');
        const submitBtn = form ? form.querySelector('button[type="submit"]') : null;
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Salvar';
        }
      }
    }

    function openGoalModal() {
      document.getElementById('goalModal').classList.add('active');
    }

    function closeGoalModal() {
      document.getElementById('goalModal').classList.remove('active');
      document.getElementById('goalForm').reset();
    }

    async function saveGoal(e) {
      e.preventDefault();
      
      // Evitar múltiplos cliques
      const submitBtn = e.target.querySelector('button[type="submit"]');
      if (submitBtn.disabled) return;
      
      submitBtn.disabled = true;
      const originalText = submitBtn.textContent;
      submitBtn.textContent = 'Salvando...';
      
      const formData = new FormData(e.target);
      const data = {
        name: formData.get('name'),
        target_amount: parseFloat(formData.get('target_amount')),
        current_amount: parseFloat(formData.get('current_amount')) || 0,
        deadline: formData.get('deadline') || null,
        user_id: currentUser.id
      };

      try {
        const { error } = await supabaseClient.from('goals').insert([data]);
        
        if (error) throw error;

        showToast('Meta cadastrada com sucesso!', 'success');
        closeGoalModal();
        await loadData();
        updateUI();
      } catch (error) {
        console.error('Error saving goal:', error);
        showToast('Erro ao cadastrar meta. Tente novamente.', 'error');
        
        // Reabilitar botão em caso de erro
        const form = document.getElementById('goalForm');
        const submitBtn = form ? form.querySelector('button[type="submit"]') : null;
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Salvar';
        }
      }
    }

    function deleteGoal(goalId, goalName) {
      const confirmDiv = document.createElement('div');
      confirmDiv.className = 'modal active';
      confirmDiv.innerHTML = `
        <div class="modal-content max-w-md">
          <h3 class="text-2xl font-bold mb-4 text-red-500">⚠️ Excluir Meta</h3>
          <p class="text-gray-300 mb-4">Tem certeza que deseja excluir a meta <strong>"${goalName}"</strong>?</p>
          <p class="text-sm text-gray-400 mb-4">Essa ação não pode ser desfeita.</p>
          
          <div class="flex gap-3">
            <button class="flex-1 btn-secondary" onclick="this.closest('.modal').remove()">Cancelar</button>
            <button class="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors" onclick="confirmDeleteGoal(${goalId})">Excluir</button>
          </div>
        </div>
      `;
      document.body.appendChild(confirmDiv);
    }

    async function confirmDeleteGoal(goalId) {
      try {
        // Evitar múltiplos cliques - desabilitar o botão
        const modal = document.querySelector('.modal.active');
        const deleteBtn = modal ? modal.querySelector('button:not(.btn-secondary)') : null;
        if (deleteBtn && deleteBtn.textContent.includes('Excluir')) {
          deleteBtn.disabled = true;
          deleteBtn.textContent = 'Excluindo...';
        }
        
        const { error } = await supabaseClient.from('goals').delete().eq('id', goalId);
        if (error) throw error;

        showToast('Meta deletada com sucesso!', 'success');
        document.querySelector('.modal.active').remove();
        await loadData();
        updateUI();
      } catch (error) {
        console.error('Error deleting goal:', error);
        showToast('Erro ao deletar meta. Tente novamente.', 'error');
        
        // Reabilitar botão em caso de erro
        const modal = document.querySelector('.modal.active');
        const deleteBtn = modal ? modal.querySelector('button:not(.btn-secondary)') : null;
        if (deleteBtn && deleteBtn.textContent === 'Excluindo...') {
          deleteBtn.disabled = false;
          deleteBtn.textContent = 'Excluir';
        }
      }
    }

    function addGoalAmount(goalId, goalName) {
      const debitCards = cards.filter(c => c.type === 'debito');

      const modalDiv = document.createElement('div');
      modalDiv.className = 'modal active';
      modalDiv.innerHTML = `
        <div class="modal-content max-w-md">
          <h3 class="text-2xl font-bold mb-4 text-green-500">➕ Adicionar à Meta</h3>
          <p class="text-gray-300 mb-4">Adicionar valor à meta <strong>"${goalName}"</strong></p>
          
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-semibold mb-2">Valor</label>
              <input type="number" id="addAmount" step="0.01" min="0.01" placeholder="0.00" class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white" autofocus>
            </div>

            <div>
              <label class="block text-sm font-semibold mb-2">Debitar de qual cartão?</label>
              <select id="addGoalCard" class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white">
                ${debitCards.map(c => {
                  const balance = calculateDebitCardBalance(c.id);
                  return `<option value="${c.id}">🏦 ${c.name} - Saldo: ${formatCurrency(balance)}</option>`;
                }).join('')}
              </select>
            </div>
          </div>

          <div class="flex gap-3 mt-6">
            <button class="flex-1 btn-secondary" onclick="this.closest('.modal').remove()">Cancelar</button>
            <button class="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors" onclick="confirmAddGoalAmount(${goalId}, '${goalName}')">Adicionar</button>
          </div>
        </div>
      `;
      document.body.appendChild(modalDiv);
    }

    async function confirmAddGoalAmount(goalId, goalName) {
      try {
        const amount = parseFloat(document.getElementById('addAmount').value);
        const cardId = parseInt(document.getElementById('addGoalCard').value);

        if (!amount || amount <= 0) {
          showToast('Informe um valor válido.', 'error');
          return;
        }

        const card = cards.find(c => c.id === cardId);
        if (!card) {
          showToast('Cartão inválido.', 'error');
          return;
        }

        // Atualizar meta
        const goal = goals.find(g => g.id === goalId);
        const newAmount = (goal.current_amount || 0) + amount;
        
        const { error: goalError } = await supabaseClient.from('goals')
          .update({ current_amount: newAmount })
          .eq('id', goalId);
        
        if (goalError) throw goalError;

        // Criar transação
        const transaction = {
          type: 'despesa',
          description: `Contribuição para meta: ${goalName}`,
          amount: amount,
          category: 'Metas',
          date: new Date().toISOString().split('T')[0],
          payment_method: 'debito',
          card_id: cardId,
          installments: 1,
          current_installment: 1,
          user_id: currentUser.id
        };

        const { error: transError } = await supabaseClient.from('transactions').insert([transaction]);
        if (transError) throw transError;

        showToast(`${formatCurrency(amount)} adicionado à meta com sucesso!`, 'success');
        document.querySelector('.modal.active').remove();
        await loadData();
        updateUI();
      } catch (error) {
        console.error('Error adding goal amount:', error);
        showToast('Erro ao adicionar valor. Tente novamente.', 'error');
      }
    }

    function withdrawGoalAmount(goalId, goalName) {
      const debitCards = cards.filter(c => c.type === 'debito');
      const goal = goals.find(g => g.id === goalId);

      const modalDiv = document.createElement('div');
      modalDiv.className = 'modal active';
      modalDiv.innerHTML = `
        <div class="modal-content max-w-md">
          <h3 class="text-2xl font-bold mb-4 text-blue-500">➖ Retirar da Meta</h3>
          <p class="text-gray-300 mb-4">Retirar valor da meta <strong>"${goalName}"</strong></p>
          <p class="text-sm text-gray-400 mb-4">Saldo atual: <strong class="text-green-400">${formatCurrency(goal.current_amount || 0)}</strong></p>
          
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-semibold mb-2">Valor</label>
              <input type="number" id="withdrawAmount" step="0.01" min="0.01" max="${goal.current_amount || 0}" placeholder="0.00" class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white" autofocus>
            </div>

            <div>
              <label class="block text-sm font-semibold mb-2">Para qual cartão depositar?</label>
              <select id="withdrawGoalCard" class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white">
                ${debitCards.map(c => {
                  const balance = calculateDebitCardBalance(c.id);
                  return `<option value="${c.id}">🏦 ${c.name} - Saldo: ${formatCurrency(balance)}</option>`;
                }).join('')}
              </select>
            </div>
          </div>

          <div class="flex gap-3 mt-6">
            <button class="flex-1 btn-secondary" onclick="this.closest('.modal').remove()">Cancelar</button>
            <button class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors" onclick="confirmWithdrawGoalAmount(${goalId}, '${goalName}')">Retirar</button>
          </div>
        </div>
      `;
      document.body.appendChild(modalDiv);
    }

    async function confirmWithdrawGoalAmount(goalId, goalName) {
      try {
        const amount = parseFloat(document.getElementById('withdrawAmount').value);
        const cardId = parseInt(document.getElementById('withdrawGoalCard').value);

        const goal = goals.find(g => g.id === goalId);

        if (!amount || amount <= 0) {
          showToast('Informe um valor válido.', 'error');
          return;
        }

        if (amount > (goal.current_amount || 0)) {
          showToast('Valor superior ao saldo da meta.', 'error');
          return;
        }

        const card = cards.find(c => c.id === cardId);
        if (!card) {
          showToast('Cartão inválido.', 'error');
          return;
        }

        // Atualizar meta
        const newAmount = (goal.current_amount || 0) - amount;
        
        const { error: goalError } = await supabaseClient.from('goals')
          .update({ current_amount: Math.max(0, newAmount) })
          .eq('id', goalId);
        
        if (goalError) throw goalError;

        // Criar transação
        const transaction = {
          type: 'receita',
          description: `Resgate da meta: ${goalName}`,
          amount: amount,
          category: 'Metas',
          date: new Date().toISOString().split('T')[0],
          payment_method: 'debito',
          card_id: cardId,
          installments: 1,
          current_installment: 1,
          user_id: currentUser.id
        };

        const { error: transError } = await supabaseClient.from('transactions').insert([transaction]);
        if (transError) throw transError;

        showToast(`${formatCurrency(amount)} retirado da meta com sucesso!`, 'success');
        document.querySelector('.modal.active').remove();
        await loadData();
        updateUI();
      } catch (error) {
        console.error('Error withdrawing goal amount:', error);
        showToast('Erro ao retirar valor. Tente novamente.', 'error');
      }
    }

    function openCategoryModal() {
      document.getElementById('categoryModal').classList.add('active');
    }

    function closeCategoryModal() {
      document.getElementById('categoryModal').classList.remove('active');
      document.getElementById('categoryForm').reset();
    }

    async function saveCategory(e) {
      e.preventDefault();
      
      const formData = new FormData(e.target);
      const data = {
        name: formData.get('name'),
        type: formData.get('type')
      };

      try {
        const { error } = await supabaseClient.from('categories').insert([data]);
        
        if (error) throw error;

        showToast('Categoria cadastrada com sucesso!', 'success');
        closeCategoryModal();
        await loadData();
        updateUI();
      } catch (error) {
        console.error('Error saving category:', error);
        showToast('Erro ao cadastrar categoria. Tente novamente.', 'error');
      }
    }

    async function deleteCategory(categoryId, categoryName) {
      const confirmDiv = document.createElement('div');
      confirmDiv.className = 'modal active';
      confirmDiv.innerHTML = `
        <div class="modal-content max-w-md">
          <h3 class="text-xl font-bold mb-4 text-red-500">Excluir Categoria</h3>
          <p class="text-gray-400 mb-6">Tem certeza que deseja excluir a categoria "<strong>${categoryName}</strong>"?</p>
          <div class="flex gap-3">
            <button class="btn-primary" style="background: #ef4444;" onclick="confirmDeleteCategory(${categoryId})">Sim, excluir</button>
            <button class="btn-secondary" onclick="this.closest('.modal').remove()">Cancelar</button>
          </div>
        </div>
      `;
      document.body.appendChild(confirmDiv);
    }

    async function confirmDeleteCategory(categoryId) {
      try {
        const { error } = await supabaseClient
          .from('categories')
          .delete()
          .eq('id', categoryId);
        
        if (error) throw error;

        showToast('Categoria excluída com sucesso!', 'success');
        document.querySelector('.modal.active').remove();
        await loadData();
        updateUI();
      } catch (error) {
        console.error('Error deleting category:', error);
        showToast('Erro ao excluir categoria. Tente novamente.', 'error');
      }
    }

    function confirmDeleteAllData() {
      const confirmDiv = document.createElement('div');
      confirmDiv.className = 'modal active';
      confirmDiv.innerHTML = `
        <div class="modal-content max-w-md">
          <h3 class="text-xl font-bold mb-4 text-red-500">⚠️ ATENÇÃO: Ação Irreversível</h3>
          <p class="text-gray-400 mb-6">Tem CERTEZA ABSOLUTA que deseja excluir TODOS os dados? Isso incluirá:<br><br>
          • Todas as transações<br>
          • Todos os cartões<br>
          • Todas as metas<br>
          • Todas as categorias personalizadas<br>
          • Todas as transações recorrentes<br><br>
          <strong class="text-red-400">Esta ação NÃO PODE ser desfeita!</strong></p>
          <div class="flex gap-3">
            <button class="btn-primary" style="background: #ef4444;" onclick="executeDeleteAllData()">Sim, excluir TUDO</button>
            <button class="btn-secondary" onclick="this.closest('.modal').remove()">Cancelar</button>
          </div>
        </div>
      `;
      document.body.appendChild(confirmDiv);
    }

    async function executeDeleteAllData() {
      try {
        await supabaseClient.from('transactions').delete().neq('id', 0);
        await supabaseClient.from('cards').delete().neq('id', 0);
        await supabaseClient.from('goals').delete().neq('id', 0);
        await supabaseClient.from('categories').delete().neq('id', 0);
        await supabaseClient.from('recurring_transactions').delete().neq('id', 0);

        // Redefinir categorias padrão
        const defaultCategories = [
          { name: 'Salário', type: 'receita' },
          { name: 'Freelance', type: 'receita' },
          { name: 'Investimento', type: 'receita' },
          { name: 'Alimentação', type: 'despesa' },
          { name: 'Transporte', type: 'despesa' },
          { name: 'Moradia', type: 'despesa' }
        ];

        await supabaseClient.from('categories').insert(defaultCategories);

        // Redefinir estatísticas do usuário
        userStats = {
          level: 1,
          xp: 0,
          totalTransactions: 0
        };

        showToast('Sistema redefinido para o padrão inicial!', 'success');
        document.querySelector('.modal.active').remove();
        await loadData();
        updateUI();
      } catch (error) {
        console.error('Error deleting all data:', error);
        showToast('Erro ao redefinir sistema. Tente novamente.', 'error');
      }
    }

    async function payCardInvoice(cardId, amount, period) {
      const card = cards.find(c => c.id === cardId);
      const debitCards = cards.filter(c => c.type === 'debito');
      
      const confirmDiv = document.createElement('div');
      confirmDiv.className = 'modal active';
      confirmDiv.innerHTML = `
        <div class="modal-content max-w-md">
          <h3 class="text-xl font-bold mb-4 text-green-500">💰 Pagar Fatura</h3>
          <p class="text-gray-400 mb-4">Confirma o pagamento da fatura de <strong>${card.name}</strong> no valor de <strong class="text-green-500">${formatCurrency(amount)}</strong>?</p>
          
          <div class="mb-4">
            <label class="block text-sm font-semibold mb-2">De qual conta você vai pagar?</label>
            <select id="paymentSourceCard" class="w-full">
              <option value="">💵 Dinheiro / Outro</option>
              ${debitCards.map(c => {
                const balance = calculateDebitCardBalance(c.id);
                return `<option value="${c.id}">🏦 ${c.name} - Saldo: ${formatCurrency(balance)}</option>`;
              }).join('')}
            </select>
          </div>

          <div class="flex gap-3">
            <button class="btn-primary" onclick="confirmPayInvoice(${cardId}, ${amount}, '${period}')">Confirmar Pagamento</button>
            <button class="btn-secondary" onclick="this.closest('.modal').remove()">Cancelar</button>
          </div>
        </div>
      `;
      document.body.appendChild(confirmDiv);
    }

    function showFutureInvoicesModal(cardId, cardName) {
      const card = cards.find(c => c.id === cardId);
      const futureInvoices = calculateFutureInvoices(cardId);
      const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

      const modalDiv = document.createElement('div');
      modalDiv.className = 'modal active';
      modalDiv.innerHTML = `
        <div class="modal-content max-w-2xl max-h-96 overflow-y-auto">
          <div class="flex items-center justify-between mb-6">
            <h3 class="text-2xl font-bold text-blue-400 flex items-center gap-2">
              <span>📊</span>
              <span>Próximas Faturas - ${cardName}</span>
            </h3>
            <button onclick="this.closest('.modal').remove()" class="text-gray-400 hover:text-white text-2xl font-bold">✕</button>
          </div>

          <div class="space-y-3">
            ${futureInvoices.map((invoice, index) => {
              const monthLabel = `${monthNames[invoice.month]} / ${invoice.year}`;
              const isUpcoming = index === 0;
              
              return `
                <div class="p-4 rounded-lg border-l-4 ${isUpcoming ? 'bg-blue-500 bg-opacity-10 border-blue-500' : 'bg-gray-800 bg-opacity-30 border-gray-600'}">
                  <div class="flex items-center justify-between">
                    <div class="flex-1">
                      <div class="flex items-center gap-3 mb-2">
                        <p class="text-sm font-bold text-gray-300">${monthLabel}</p>
                        ${isUpcoming ? `<span class="text-xs bg-blue-500 px-3 py-1 rounded-full font-semibold text-white">📍 Próxima</span>` : ''}
                      </div>
                      <p class="text-lg font-bold ${isUpcoming ? 'text-blue-400' : 'text-green-400'}">${formatCurrency(invoice.amount)}</p>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          <div class="mt-6 pt-6 border-t border-gray-700">
            <div class="grid grid-cols-3 gap-4 mb-4">
              <div class="bg-gray-800 bg-opacity-50 p-3 rounded-lg text-center">
                <p class="text-xs text-gray-400 mb-1">Total em Faturas</p>
                <p class="text-xl font-bold text-green-400">${formatCurrency(futureInvoices.reduce((sum, inv) => sum + inv.amount, 0))}</p>
              </div>
              <div class="bg-gray-800 bg-opacity-50 p-3 rounded-lg text-center">
                <p class="text-xs text-gray-400 mb-1">Quantidade</p>
                <p class="text-xl font-bold text-blue-400">${futureInvoices.length}</p>
              </div>
              <div class="bg-gray-800 bg-opacity-50 p-3 rounded-lg text-center">
                <p class="text-xs text-gray-400 mb-1">Média</p>
                <p class="text-xl font-bold text-yellow-400">${formatCurrency(futureInvoices.reduce((sum, inv) => sum + inv.amount, 0) / futureInvoices.length)}</p>
              </div>
            </div>
          </div>

          <div class="mt-4">
            <button onclick="this.closest('.modal').remove()" class="btn-secondary w-full">Fechar</button>
          </div>
        </div>
      `;
      document.body.appendChild(modalDiv);
    }

    async function confirmPayInvoice(cardId, amount, period) {
      try {
        const paymentSourceSelect = document.getElementById('paymentSourceCard');
        const paymentSourceCardId = paymentSourceSelect.value ? parseInt(paymentSourceSelect.value) : null;
        
        const card = cards.find(c => c.id === cardId);
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        
        // Buscar todas as transações da fatura atual (mês atual)
        const invoiceTransactions = transactions.filter(t => {
          if (t.card_id !== cardId || t.type !== 'despesa' || t.payment_method !== 'credito') {
            return false;
          }
          
          const tDate = new Date(t.date + 'T00:00:00');
          return tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear;
        });

        // Adicionar recorrentes projetadas do mês atual
        const projectedRecurrings = getProjectedRecurringTransactions(currentMonth, currentYear);
        const recurringInvoiceTransactions = projectedRecurrings.filter(t => 
          t.card_id === cardId && t.type === 'despesa' && t.payment_method === 'credito'
        );

        // Registrar pagamento da fatura como RECEITA negativa (débito)
        // Isso vai reduzir o saldo da conta de débito, sem deletar as transações de crédito
        const data = {
          type: 'despesa',
          description: `Pagamento Fatura - ${card.name}`,
          amount: amount,
          category: 'Contas',
          date: now.toISOString().split('T')[0],
          payment_method: 'pagamento_fatura',
          card_id: paymentSourceCardId,
          installments: 1,
          current_installment: 1
        };

        const { error } = await supabaseClient.from('transactions').insert([data]);
        if (error) throw error;

        // NÃO deletar as transações de crédito - elas devem permanecer para histórico
        // A recurrente permanente do mês que vem vai ser considerada naturalmente no próximo mês
        
        showToast(`Pagamento de ${formatCurrency(amount)} registrado com sucesso!`, 'success');
        document.querySelector('.modal.active').remove();
        await loadData();
        updateUI();
      } catch (error) {
        console.error('Error paying invoice:', error);
        showToast('Erro ao registrar pagamento. Tente novamente.', 'error');
      }
    }

    function setDefaultDate() {
      const dateInput = document.getElementById('transactionDate');
      if (dateInput) {
        const today = new Date().toISOString().split('T')[0];
        dateInput.value = today;
      }
    }

    function formatCurrency(value) {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      }).format(value);
    }

    function formatDate(dateString) {
      const date = new Date(dateString + 'T00:00:00');
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    }

    let toastDragState = {
      isDragging: false,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      toast: null
    };

    function showToast(message, type = 'info') {
      const existingToast = document.querySelector('.toast');
      if (existingToast) {
        existingToast.remove();
      }

      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;

      const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
      const color = type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6';
      
      // Determinar cor baseado no tema
      const isDarkTheme = document.documentElement.getAttribute('data-theme') !== 'light';
      const textColor = isDarkTheme ? '#ffffff' : '#1f2937';
      
      toast.style.borderColor = color;
      toast.style.color = textColor;
      toast.innerHTML = `
        <div class="flex items-center gap-3">
          <span style="font-size: 24px;">${icon}</span>
          <p class="flex-1">${message}</p>
          <button onclick="this.parentElement.parentElement.remove()" class="text-gray-400 hover:text-white ml-2" style="color: ${textColor};">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      `;

      toast.addEventListener('mousedown', startDrag);
      toast.addEventListener('touchstart', startDrag);

      document.body.appendChild(toast);

      setTimeout(() => {
        if (toast.parentElement) {
          toast.classList.add('dismissing');
          toast.style.opacity = '0';
          setTimeout(() => toast.remove(), 300);
        }
      }, 5000);
    }

    function startDrag(e) {
      const toast = e.currentTarget;
      toastDragState.toast = toast;
      toastDragState.isDragging = true;
      
      const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
      const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
      
      toastDragState.startX = clientX;
      toastDragState.startY = clientY;
      
      toast.classList.add('dragging');
      
      document.addEventListener('mousemove', drag);
      document.addEventListener('touchmove', drag);
      document.addEventListener('mouseup', endDrag);
      document.addEventListener('touchend', endDrag);
    }

    function drag(e) {
      if (!toastDragState.isDragging) return;
      
      const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
      const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
      
      const deltaX = clientX - toastDragState.startX;
      const deltaY = clientY - toastDragState.startY;
      
      toastDragState.currentX = deltaX;
      toastDragState.currentY = deltaY;
      
      toastDragState.toast.style.transform = `translateX(calc(-50% + ${deltaX}px)) translateY(${deltaY}px)`;
    }

    function endDrag() {
      if (!toastDragState.isDragging) return;
      
      const threshold = 100;
      const distance = Math.sqrt(
        Math.pow(toastDragState.currentX, 2) + 
        Math.pow(toastDragState.currentY, 2)
      );
      
      if (distance > threshold) {
        toastDragState.toast.classList.add('dismissing');
        toastDragState.toast.style.transform = `translateX(calc(-50% + ${toastDragState.currentX * 3}px)) translateY(${toastDragState.currentY * 3}px)`;
        toastDragState.toast.style.opacity = '0';
        setTimeout(() => {
          if (toastDragState.toast && toastDragState.toast.parentElement) {
            toastDragState.toast.remove();
          }
        }, 300);
      } else {
        toastDragState.toast.style.transform = 'translateX(-50%) translateY(0)';
      }
      
      toastDragState.toast.classList.remove('dragging');
      toastDragState.isDragging = false;
      toastDragState.currentX = 0;
      toastDragState.currentY = 0;
      
      document.removeEventListener('mousemove', drag);
      document.removeEventListener('touchmove', drag);
      document.removeEventListener('mouseup', endDrag);
      document.removeEventListener('touchend', endDrag);
    }

    // SISTEMA DE TEMAS
    function initTheme() {
      const savedTheme = localStorage.getItem('appTheme') || 'light';
      setTheme(savedTheme);
    }

    function setTheme(theme) {
      localStorage.setItem('appTheme', theme);
      
      const html = document.documentElement;
      const themeDarkBtn = document.getElementById('themeDarkBtn');
      const themeLightBtn = document.getElementById('themeLightBtn');

      if (theme === 'light') {
        html.setAttribute('data-theme', 'light');
        
        // Adicionar classe light ao body
        document.body.style.setProperty('--bg-primary', '#ffffff');
        document.body.style.setProperty('--bg-secondary', '#f8f9fa');
        document.body.style.setProperty('--bg-tertiary', '#eff3f8');
        document.body.style.setProperty('--text-primary', '#1a202c');
        document.body.style.setProperty('--text-secondary', '#4a5568');
        document.body.style.setProperty('--border-color', '#e2e8f0');
        document.body.style.setProperty('--card-bg', '#f8f9fa');
        
        // Aplicar estilos light
        applyLightTheme();
        
        if (themeLightBtn) {
          themeLightBtn.classList.add('bg-blue-500', 'text-white', 'border-blue-500');
          themeLightBtn.classList.remove('text-gray-400', 'border-gray-600');
          themeLightBtn.style.color = '#ffffff';
        }
        if (themeDarkBtn) {
          themeDarkBtn.classList.remove('bg-blue-500', 'text-white', 'border-blue-500');
          themeDarkBtn.classList.add('text-gray-400', 'border-gray-600');
          themeDarkBtn.style.color = '#888888';
        }
      } else {
        html.setAttribute('data-theme', 'dark');
        
        // Resetar para dark
        document.body.style.removeProperty('--bg-primary');
        document.body.style.removeProperty('--bg-secondary');
        document.body.style.removeProperty('--bg-tertiary');
        document.body.style.removeProperty('--text-primary');
        document.body.style.removeProperty('--text-secondary');
        document.body.style.removeProperty('--border-color');
        document.body.style.removeProperty('--card-bg');
        
        applyDarkTheme();
        
        if (themeDarkBtn) {
          themeDarkBtn.classList.add('bg-blue-500', 'text-white', 'border-blue-500');
          themeDarkBtn.classList.remove('text-gray-400', 'border-gray-600');
          themeDarkBtn.style.color = '#ffffff';
        }
        if (themeLightBtn) {
          themeLightBtn.classList.remove('bg-blue-500', 'text-white', 'border-blue-500');
          themeLightBtn.classList.add('text-gray-400', 'border-gray-600');
          themeLightBtn.style.color = '#888888';
        }
      }
      
      updateThemeToggleIcon();
    }

    function toggleTheme() {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      setTheme(newTheme);
    }

    function updateThemeToggleIcon() {
      const themeIcon = document.getElementById('themeToggleIcon');
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      
      if (themeIcon) {
        if (currentTheme === 'dark') {
          // SVG Raio para Turbo (dark)
          themeIcon.innerHTML = '<path d="M13 2L3 14H9L11 22L21 10H15L13 2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" fill="none"/>';
        } else {
          // SVG Mala para Minimal (light)
          themeIcon.innerHTML = '<path d="M20 7V19C20 20.1046 19.1046 21 18 21H6C4.89543 21 4 20.1046 4 19V7M9 11V13M15 11V13M8 7V6C8 4.89543 8.89543 4 10 4H14C15.1046 4 16 4.89543 16 6V7M6 7H18" stroke="currentColor" stroke-width="2" stroke-linejoin="round" fill="none"/>';
        }
      }
    }

    function applyLightTheme() {
      // Body e background - Pure white
      document.body.style.background = '#ffffff';
      document.body.style.color = '#2c3e50';

      // Sidebar - Soft blue-gray
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) {
        sidebar.style.background = '#f5f7fa';
        sidebar.style.borderRight = '1px solid #d5dce0';
      }

      // Main content - Pure white
      const mainContent = document.querySelector('.main-content');
      if (mainContent) {
        mainContent.style.background = '#ffffff';
      }

      // Pages - White background
      document.querySelectorAll('.page').forEach(page => {
        page.style.background = '#ffffff';
      });

      // Month selector (roleta) - Clean light background
      document.querySelectorAll('.month-selector').forEach(el => {
        el.style.background = '#f5f7fa';
        el.style.borderColor = '#d5dce0';
        el.style.color = '#2c3e50';
      });

      // Month label text - Blue
      document.querySelectorAll('.month-label').forEach(label => {
        label.style.color = '#3b82f6';
      });

      // Stat cards - Light background with subtle borders
      document.querySelectorAll('.stat-card').forEach(card => {
        card.style.background = '#f9fbfc';
        card.style.borderColor = '#d5dce0';
        card.style.color = '#2c3e50';
        card.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.05)';
      });

      // Chart containers
      document.querySelectorAll('.chart-container').forEach(container => {
        container.style.background = '#f9fbfc';
        container.style.borderColor = '#d5dce0';
        container.style.color = '#2c3e50';
      });

      // Transaction items
      document.querySelectorAll('.transaction-item').forEach(item => {
        item.style.background = '#f9fbfc';
        item.style.borderColor = '#d5dce0';
        item.style.color = '#2c3e50';
      });

      // Projected transaction items
      document.querySelectorAll('.transaction-item.projected').forEach(item => {
        item.style.background = '#eff3f8';
        item.style.borderColor = '#bfdbfe';
      });

      // Inputs - Clean white with light border
      document.querySelectorAll('input, select, textarea').forEach(input => {
        input.style.background = '#ffffff';
        input.style.borderColor = '#d5dce0';
        input.style.color = '#2c3e50';
        input.style.transition = 'border-color 0.3s ease';
      });

      // Input focus states
      document.querySelectorAll('input, select, textarea').forEach(input => {
        input.onfocus = function() {
          this.style.borderColor = '#3b82f6';
          this.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
        };
        input.onblur = function() {
          this.style.borderColor = '#d5dce0';
          this.style.boxShadow = 'none';
        };
      });

      // Modal - White background with shadow
      document.querySelectorAll('.modal-content').forEach(modal => {
        modal.style.background = '#ffffff';
        modal.style.color = '#2c3e50';
        modal.style.boxShadow = '0 10px 40px rgba(0, 0, 0, 0.08)';
      });

      // Modal backdrop
      document.querySelectorAll('.modal').forEach(modalBg => {
        modalBg.style.background = 'rgba(0, 0, 0, 0.3)';
      });

      // Progress bar - Light blue
      document.querySelectorAll('.progress-bar').forEach(bar => {
        bar.style.background = '#eef1f6';
        const fill = bar.querySelector('.progress-fill') || bar.querySelector('div');
        if (fill) {
          fill.style.background = 'linear-gradient(90deg, #3b82f6 0%, #0ea5e9 100%)';
        }
      });

      // Primary buttons - Blue gradient
      document.querySelectorAll('.btn-primary').forEach(btn => {
        btn.style.background = 'linear-gradient(135deg, #3b82f6 0%, #0ea5e9 100%)';
        btn.style.color = '#ffffff';
        btn.style.border = 'none';
        btn.style.boxShadow = '0 2px 8px rgba(59, 130, 246, 0.2)';
      });

      // Secondary buttons - Light background
      document.querySelectorAll('.btn-secondary').forEach(btn => {
        btn.style.background = '#f5f7fa';
        btn.style.color = '#2c3e50';
        btn.style.borderColor = '#d5dce0';
        btn.style.border = '1px solid #d5dce0';
      });

      // Calculator buttons
      document.querySelectorAll('.calc-btn').forEach(btn => {
        btn.style.background = '#f5f7fa';
        btn.style.color = '#2c3e50';
        btn.style.border = '1px solid #d5dce0';
      });

      document.querySelectorAll('.calc-btn-operator').forEach(btn => {
        btn.style.background = '#eff3f8';
        btn.style.color = '#3b82f6';
        btn.style.border = '1px solid #bfdbfe';
      });

      document.querySelectorAll('.calc-btn-clear').forEach(btn => {
        btn.style.background = '#fef2f2';
        btn.style.color = '#dc2626';
        btn.style.border = '1px solid #fecaca';
      });

      document.querySelectorAll('.calc-btn-equals, .calc-btn-send').forEach(btn => {
        btn.style.background = 'linear-gradient(135deg, #3b82f6 0%, #0ea5e9 100%)';
        btn.style.color = '#ffffff';
        btn.style.border = 'none';
      });

      // Danger buttons - Light red
      document.querySelectorAll('button').forEach(btn => {
        if (btn.textContent.includes('Deletar') || btn.textContent.includes('Remover') || btn.classList.contains('btn-danger')) {
          btn.style.background = '#fef2f2';
          btn.style.color = '#dc2626';
          btn.style.borderColor = '#fecaca';
          btn.style.border = '1px solid #fecaca';
        }
      });

      // Success/Payment buttons - Light green
      document.querySelectorAll('button').forEach(btn => {
        if (btn.textContent.includes('Pagar') || btn.textContent.includes('Confirmar') || btn.classList.contains('btn-success')) {
          btn.style.background = '#f0fdf4';
          btn.style.color = '#16a34a';
          btn.style.borderColor = '#bbf7d0';
          btn.style.border = '1px solid #bbf7d0';
        }
      });

      // Text colors - Professional dark gray
      document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(heading => {
        heading.style.color = '#2c3e50';
      });

      // Secondary text - Medium gray
      document.querySelectorAll('.text-gray-400, .text-gray-500').forEach(text => {
        text.style.color = '#7f8c8d';
      });

      // Achievement badges styling
      document.querySelectorAll('.achievement').forEach(achievement => {
        achievement.style.background = '#f9fbfc';
        achievement.style.borderColor = '#d5dce0';
        achievement.style.color = '#2c3e50';
        
        const unlocked = achievement.classList.contains('unlocked');
        if (unlocked) {
          achievement.style.borderColor = '#3b82f6';
          achievement.style.background = 'linear-gradient(135deg, rgba(59, 130, 246, 0.05), transparent)';
        }
      });

      // Category items styling
      document.querySelectorAll('.category-item').forEach(item => {
        item.style.background = '#f9fbfc';
        item.style.borderColor = '#d5dce0';
        item.style.color = '#2c3e50';
      });

      // Achievement and category text - update colors in rendered content
      document.querySelectorAll('.achievement h4, .category-item span').forEach(el => {
        el.style.color = '#2c3e50';
      });

      // Achievement description text
      document.querySelectorAll('.achievement p').forEach(p => {
        p.style.color = '#7f8c8d';
      });

      // Transaction type buttons - Light default
      document.querySelectorAll('.btn-transaction-type, .btn-recurring-type, .btn-duration').forEach(btn => {
        btn.style.background = 'transparent';
        btn.style.borderColor = '#d5dce0';
        btn.style.color = '#7f8c8d';
      });

      // Income/Permanent selected buttons - Blue
      document.querySelectorAll('.btn-income-selected, .btn-permanent-selected').forEach(btn => {
        btn.style.background = 'rgba(59, 130, 246, 0.1)';
        btn.style.borderColor = '#3b82f6';
        btn.style.color = '#3b82f6';
      });

      // Expense/Temporary selected buttons - Red
      document.querySelectorAll('.btn-expense-selected, .btn-temporary-selected').forEach(btn => {
        btn.style.background = 'rgba(239, 68, 68, 0.1)';
        btn.style.borderColor = '#ef4444';
        btn.style.color = '#ef4444';
      });

      // Installment simulation box - Light blue
      document.querySelectorAll('.installment-simulation-box').forEach(box => {
        box.style.background = 'rgba(59, 130, 246, 0.05)';
        box.style.borderColor = '#3b82f6';
      });

      // Installment title - Blue
      document.querySelectorAll('.installment-title').forEach(title => {
        title.style.color = '#3b82f6';
      });

      // Installment label - Gray
      document.querySelectorAll('.installment-label').forEach(label => {
        label.style.color = '#7f8c8d';
      });

      // Installment checkbox - Blue accent
      document.querySelectorAll('.installment-checkbox').forEach(checkbox => {
        checkbox.style.accentColor = '#3b82f6';
      });

      // Sidebar items styling
      document.querySelectorAll('.sidebar-item').forEach(item => {
        item.style.color = '#7f8c8d';
        item.style.borderLeftColor = 'transparent';
      });

      // Credit and debit card visuals
      document.querySelectorAll('.credit-card-visual, .card-visual, [class*="card-visual"]').forEach(card => {
        card.style.background = 'linear-gradient(135deg, #ffffff 0%, #f9fbfc 100%)';
        card.style.borderColor = '#d5dce0';
        card.style.color = '#2c3e50';
      });

      // Tables, lists, and transaction containers
      document.querySelectorAll('table, tr, td, [class*="transaction"], [class*="list"]').forEach(el => {
        if (el.style) {
          const currentBg = el.style.background;
          if (currentBg && (currentBg.includes('#1a1a1a') || currentBg.includes('#0a0a0a') || currentBg.includes('dark'))) {
            el.style.background = '#ffffff';
          }
        }
      });

      // SVG icons color
      document.querySelectorAll('svg').forEach(svg => {
        const stroke = svg.getAttribute('stroke');
        const color = svg.getAttribute('color');
        
        if (stroke === '#888' || stroke === '#e5e5e5' || stroke === 'currentColor') {
          // Keep currentColor for inherited colors
        }
        if (!color || color === '#888' || color === '#e5e5e5') {
          svg.setAttribute('color', '#7f8c8d');
        }
        
        // SVG strokes in categories/achievements
        if (stroke === '#10b981' || stroke === '#ef4444') {
          // Keep original colors for income/expense indicators
        }
      });

      // Category and achievement SVG icons - update for light theme
      document.querySelectorAll('.category-item svg, .achievement svg').forEach(svg => {
        const stroke = svg.getAttribute('stroke');
        if (stroke === '#10b981' || stroke === '#ef4444') {
          // Keep original colors
        } else if (stroke === '#888' || stroke === '#e5e5e5') {
          svg.setAttribute('stroke', '#7f8c8d');
        }
      });

      // Border colors
      document.querySelectorAll('[class*="border"]').forEach(el => {
        if (el.style && el.style.borderColor) {
          const borderColor = el.style.borderColor;
          if (borderColor === '#2a2a2a' || borderColor === '#1a1a1a') {
            el.style.borderColor = '#d5dce0';
          }
        }
      });

      // XP circle mini styling
      const xpCircleMini = document.getElementById('xpCircleMini');
      if (xpCircleMini) {
        xpCircleMini.style.stroke = 'url(#gradientMini)';
      }

      // Back to current button styling
      document.querySelectorAll('#backToCurrentBtn, #backToCurrentBtn2').forEach(btn => {
        btn.style.background = 'linear-gradient(135deg, #3b82f6 0%, #0ea5e9 100%)';
        btn.style.color = '#ffffff';
        btn.style.border = 'none';
      });

      // Profile avatar circle
      document.querySelectorAll('[style*="from-green"]').forEach(el => {
        el.style.background = 'linear-gradient(to bottom right, #3b82f6, #0ea5e9)';
      });

      // Achievement badges
      document.querySelectorAll('[class*="achievement"], [class*="badge"]').forEach(el => {
        if (el.style.background && el.style.background.includes('dark')) {
          el.style.background = '#f9fbfc';
          el.style.borderColor = '#d5dce0';
        }
      });
    }

    function applyDarkTheme() {
      // Body e background - Dark theme base
      document.body.style.background = '#0a0a0a';
      document.body.style.color = '#e5e5e5';

      // Sidebar - Dark
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) {
        sidebar.style.background = '#000';
        sidebar.style.borderRight = '1px solid #1a1a1a';
      }

      // Main content - Dark
      const mainContent = document.querySelector('.main-content');
      if (mainContent) {
        mainContent.style.background = '#0a0a0a';
      }

      // Pages - Dark
      document.querySelectorAll('.page').forEach(page => {
        page.style.background = '#0a0a0a';
      });

      // Month selector - Dark
      document.querySelectorAll('.month-selector').forEach(selector => {
        selector.style.background = '#2e2e2d';
        selector.style.borderColor = '#5c5c5c';
      });

      // Month label - Green
      document.querySelectorAll('.month-label').forEach(label => {
        label.style.color = '#10b981';
      });

      // Stat cards - Dark gradient
      document.querySelectorAll('.stat-card').forEach(card => {
        card.style.background = 'linear-gradient(135deg, #1a1a1a 0%, #0f0f0f 100%)';
        card.style.borderColor = '#2a2a2a';
        card.style.color = '#e5e5e5';
        card.style.boxShadow = 'none';
      });

      // Chart containers - Dark
      document.querySelectorAll('.chart-container').forEach(container => {
        container.style.background = '#1a1a1a';
        container.style.borderColor = '#2a2a2a';
        container.style.color = '#e5e5e5';
      });

      // Transaction items - Dark
      document.querySelectorAll('.transaction-item').forEach(item => {
        item.style.background = '#1a1a1a';
        item.style.borderColor = '#2a2a2a';
        item.style.color = '#e5e5e5';
      });

      // Projected transactions - Dark blue tint
      document.querySelectorAll('.transaction-item.projected').forEach(item => {
        item.style.background = 'rgba(59, 130, 246, 0.1)';
        item.style.borderColor = 'rgba(59, 130, 246, 0.3)';
      });

      // Achievement badges - Dark
      document.querySelectorAll('.achievement').forEach(achievement => {
        achievement.style.background = '#1a1a1a';
        achievement.style.borderColor = '#2a2a2a';
        achievement.style.color = '#e5e5e5';
      });

      // Unlocked achievements - Green tint
      document.querySelectorAll('.achievement.unlocked').forEach(achievement => {
        achievement.style.borderColor = '#10b981';
        achievement.style.background = 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), transparent)';
      });

      // Category items - Dark
      document.querySelectorAll('.category-item').forEach(item => {
        item.style.background = '#1a1a1a';
        item.style.borderColor = '#2a2a2a';
        item.style.color = '#e5e5e5';
      });

      // Inputs - Dark
      document.querySelectorAll('input, select, textarea').forEach(input => {
        input.style.background = '#1a1a1a';
        input.style.borderColor = '#2a2a2a';
        input.style.color = '#e5e5e5';
      });

      // Input focus - Green glow
      document.querySelectorAll('input, select, textarea').forEach(input => {
        input.onfocus = function() {
          this.style.borderColor = '#10b981';
          this.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.1)';
        };
        input.onblur = function() {
          this.style.borderColor = '#2a2a2a';
          this.style.boxShadow = 'none';
        };
      });

      // Modals - Dark
      document.querySelectorAll('.modal-content').forEach(modal => {
        modal.style.background = '#0a0a0a';
        modal.style.color = '#e5e5e5';
        modal.style.borderColor = '#2a2a2a';
        modal.style.boxShadow = '0 10px 40px rgba(0, 0, 0, 0.5)';
      });

      // Modal backdrop - Dark
      document.querySelectorAll('.modal').forEach(modalBg => {
        modalBg.style.background = 'rgba(0, 0, 0, 0.8)';
      });

      // Progress bar - Dark
      document.querySelectorAll('.progress-bar').forEach(bar => {
        bar.style.background = '#2a2a2a';
      });

      // Progress fill - Green gradient
      document.querySelectorAll('.progress-fill').forEach(fill => {
        fill.style.background = 'linear-gradient(90deg, #10b981, #059669)';
      });

      // Primary buttons - Green gradient
      document.querySelectorAll('.btn-primary').forEach(btn => {
        btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        btn.style.color = '#000';
        btn.style.border = 'none';
        btn.style.boxShadow = '0 2px 8px rgba(16, 185, 129, 0.2)';
      });

      // Secondary buttons - Dark
      document.querySelectorAll('.btn-secondary').forEach(btn => {
        btn.style.background = '#1a1a1a';
        btn.style.color = '#e5e5e5';
        btn.style.borderColor = '#2a2a2a';
        btn.style.border = '1px solid #2a2a2a';
      });

      // Danger buttons - Red/Dark
      document.querySelectorAll('.btn-danger').forEach(btn => {
        btn.style.background = 'transparent';
        btn.style.color = '#ef4444';
        btn.style.borderColor = '#ef4444';
        btn.style.border = '1px solid #ef4444';
      });

      // Calculator buttons - Dark
      document.querySelectorAll('.calc-btn').forEach(btn => {
        btn.style.background = '#1a1a1a';
        btn.style.color = '#e5e5e5';
        btn.style.border = '1px solid #2a2a2a';
      });

      // Calculator operator buttons - Green
      document.querySelectorAll('.calc-btn-operator').forEach(btn => {
        btn.style.background = '#10b981';
        btn.style.color = '#000';
        btn.style.border = 'none';
      });

      // Calculator clear button - Red
      document.querySelectorAll('.calc-btn-clear').forEach(btn => {
        btn.style.background = '#ef4444';
        btn.style.color = '#fff';
        btn.style.border = 'none';
      });

      // Calculator equals/send buttons - Blue gradient
      document.querySelectorAll('.calc-btn-equals, .calc-btn-send').forEach(btn => {
        btn.style.background = '#0ea5e9';
        btn.style.color = '#fff';
        btn.style.border = 'none';
      });

      // Transaction type buttons - Dark default
      document.querySelectorAll('.btn-transaction-type, .btn-recurring-type, .btn-duration').forEach(btn => {
        btn.style.background = 'transparent';
        btn.style.borderColor = '#2a2a2a';
        btn.style.color = '#888';
      });

      // Income/Permanent selected - Green
      document.querySelectorAll('.btn-income-selected, .btn-permanent-selected').forEach(btn => {
        btn.style.background = 'rgba(16, 185, 129, 0.1)';
        btn.style.borderColor = '#10b981';
        btn.style.color = '#10b981';
      });

      // Expense/Temporary selected - Red
      document.querySelectorAll('.btn-expense-selected, .btn-temporary-selected').forEach(btn => {
        btn.style.background = 'rgba(239, 68, 68, 0.1)';
        btn.style.borderColor = '#ef4444';
        btn.style.color = '#ef4444';
      });

      // Installment simulation box - Green
      document.querySelectorAll('.installment-simulation-box').forEach(box => {
        box.style.background = 'rgba(16, 185, 129, 0.1)';
        box.style.borderColor = '#10b981';
      });

      // Installment title - Green
      document.querySelectorAll('.installment-title').forEach(title => {
        title.style.color = '#10b981';
      });

      // Installment label - Gray
      document.querySelectorAll('.installment-label').forEach(label => {
        label.style.color = '#888';
      });

      // Installment checkbox - Green accent
      document.querySelectorAll('.installment-checkbox').forEach(checkbox => {
        checkbox.style.accentColor = '#10b981';
      });

      // Text colors - Light gray
      document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(heading => {
        heading.style.color = '#e5e5e5';
      });

      // Secondary text - Medium gray
      document.querySelectorAll('.text-gray-400, .text-gray-500').forEach(text => {
        text.style.color = '#888';
      });

      // Sidebar items - Default gray
      document.querySelectorAll('.sidebar-item').forEach(item => {
        item.style.color = '#888';
        item.style.borderLeftColor = 'transparent';
      });

      // Credit card visuals - Dark gradient
      document.querySelectorAll('.credit-card-visual, .card-visual').forEach(card => {
        card.style.background = 'linear-gradient(135deg, #1a4d3a, #0f2f24)';
        card.style.borderColor = '#2a2a2a';
        card.style.color = '#e5e5e5';
      });

      // SVG icons - Gray
      document.querySelectorAll('svg').forEach(svg => {
        const stroke = svg.getAttribute('stroke');
        const color = svg.getAttribute('color');
        
        if (stroke === '#7f8c8d' || stroke === '#2c3e50') {
          svg.setAttribute('stroke', '#888');
        }
        if (color === '#7f8c8d' || color === '#2c3e50') {
          svg.setAttribute('color', '#888');
        }
      });

      // Back to current button - Green
      document.querySelectorAll('#backToCurrentBtn, #backToCurrentBtn2').forEach(btn => {
        btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        btn.style.color = '#000';
        btn.style.border = 'none';
      });

      // Profile avatar - Green gradient
      document.querySelectorAll('[class*="from-green"]').forEach(el => {
        el.style.background = 'linear-gradient(to bottom right, #10b981, #059669)';
      });
    }

    // Initialize app
    init();
    initTheme();