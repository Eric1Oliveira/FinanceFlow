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
    
    // Flag para rastrear de qual modal foi aberto (transaction, recurring, ou null)
    let openedFromModal = null;
    
    // Flag para rastrear se o usuário é admin
    let isCurrentUserAdmin = false;

    // State
    let transactions = [];
    let cards = [];
    let goals = [];
    let recurringTransactions = [];
    let currentViewDate = new Date();
    let currentPage = 'dashboard'; // Rastreia a página atual
    let achievementsPage = 0; // Página atual de conquistas
    let banks = []; // Instituições financeiras
    let cdiRate = 0; // Taxa CDI anual
    let chartGranularity = 'month'; // Granularidade do gráfico: 'day', 'month', 'year'
    let lastSimulationParams = {}; // Armazenar últimos parâmetros da simulação
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
      console.log('Iniciando loadData...');
      await loadData();
      console.log('loadData concluído. Banks:', banks);
      await checkAdminStatus();
      
      // Carregue a UI do simulador
      console.log('Chamando loadSimulatorUI...');
      loadSimulatorUI();
      
      // Inicializar FAB draggable
      initializeFABDraggable();
      
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
        
        isCurrentUserAdmin = data?.is_admin || false;
        const themeBtn = document.getElementById('themeToggleBtn');
        
        if (themeBtn) {
          if (isCurrentUserAdmin) {
            themeBtn.style.display = 'flex';
          } else {
            themeBtn.style.display = 'none';
          }
        }
      } catch (error) {
        console.error('Erro ao verificar status de admin:', error);
        isCurrentUserAdmin = false;
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
      let timeoutId = null;
      const resetButton = () => {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Entrar';
      };
      
      timeoutId = setTimeout(() => {
        resetButton();
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
      } finally {
        resetButton();
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
      let timeoutId = null;
      const resetButton = () => {
        signupBtn.disabled = false;
        signupBtn.textContent = 'Criar Conta';
      };
      
      timeoutId = setTimeout(() => {
        resetButton();
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
      } finally {
        resetButton();
      }
    }

    // Atualizar nome do usuário na sidebar
    function updateUserProfileName() {
      if (currentUser) {
        // Tentar usar nome salvo nas configurações, senão usar email ou padrão
        const savedName = localStorage.getItem(`userName_${currentUser.id}`);
        const fullName = savedName || currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'Usuário';
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

    // Mobile Menu Toggle Functions
    function toggleMobileMenu() {
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('mobileMenuOverlay');
      
      sidebar.classList.toggle('active');
      overlay.classList.toggle('active');
    }

    function closeMobileMenu() {
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('mobileMenuOverlay');
      
      sidebar.classList.remove('active');
      overlay.classList.remove('active');
    }

    // Close mobile menu when navigating
    const originalNavigateTo = window.navigateTo;
    window.navigateTo = function(page) {
      closeMobileMenu();
      return originalNavigateTo(page);
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

        // Carregar bancos e CDI para o simulador
        const banksResult = await supabaseClient
          .from('banks')
          .select('*')
          .order('name', { ascending: true });
        
        if (banksResult.error) {
          console.warn('Erro ao carregar bancos:', banksResult.error);
        } else if (banksResult.data) {
          banks = banksResult.data;
          console.log('Bancos carregados:', banks.length, banks);
          // Atualizar o select de bancos
          const bankSelect = document.getElementById('simulatorBank');
          if (bankSelect && banks.length > 0) {
            bankSelect.innerHTML = '<option value="">-- Personalizado --</option>' + 
              banks.map(b => `<option value="${b.id}">${b.name} (${b.cdi_percentage}% do CDI)</option>`).join('');
          }
        }

        const cdiResult = await supabaseClient
          .from('cdi_rates')
          .select('*')
          .order('year', { ascending: false })
          .limit(1);
        
        if (cdiResult.error) {
          console.warn('Erro ao carregar CDI:', cdiResult.error);
        } else if (cdiResult.data && cdiResult.data.length > 0) {
          cdiRate = cdiResult.data[0].annual_rate;
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
        
        const startMonth = startDate.getMonth();
        const startYear = startDate.getFullYear();
        
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

        // NÃO mostrar como projeção se for o mês de início da recorrente
        // porque já foi criada uma transação real quando a recorrente foi cadastrada
        const isStartMonth = month === startMonth && year === startYear;
        
        if (isStartMonth) {
          // Pular a projeção no mês de início - a transação real já foi criada
          continue;
        }

        // Apenas mostrar como projeção se a data for FUTURA (não foi criada ainda)
        // Transações já criadas aparecem normalmente na lista de transações
        if (transactionDate <= today) {
          continue;
        }

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
          is_projected: true
        });
      }

      return projectedTransactions;
    }

    function initializeFABDraggable() {
      const fab = document.getElementById('fabButton');
      if (!fab) return;

      let isDragging = false;
      let currentX;
      let currentY;
      let initialX;
      let initialY;

      // Restaurar posição salva
      const savedPosition = localStorage.getItem('fabPosition');
      if (savedPosition) {
        const { bottom, right } = JSON.parse(savedPosition);
        fab.style.bottom = bottom + 'px';
        fab.style.right = right + 'px';
      }

      fab.addEventListener('mousedown', (e) => {
        isDragging = true;
        initialX = e.clientX - fab.offsetLeft;
        initialY = e.clientY - fab.offsetTop;
        fab.style.cursor = 'grabbing';
        fab.style.transition = 'none';
      });

      fab.addEventListener('touchstart', (e) => {
        isDragging = true;
        initialX = e.touches[0].clientX - fab.offsetLeft;
        initialY = e.touches[0].clientY - fab.offsetTop;
        fab.style.cursor = 'grabbing';
        fab.style.transition = 'none';
      });

      document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;

        // Limitar ao viewport
        const maxX = window.innerWidth - fab.offsetWidth;
        const maxY = window.innerHeight - fab.offsetHeight;

        currentX = Math.max(0, Math.min(currentX, maxX));
        currentY = Math.max(0, Math.min(currentY, maxY));

        fab.style.left = currentX + 'px';
        fab.style.top = currentY + 'px';
        fab.style.right = 'auto';
        fab.style.bottom = 'auto';
      });

      document.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        
        currentX = e.touches[0].clientX - initialX;
        currentY = e.touches[0].clientY - initialY;

        // Limitar ao viewport
        const maxX = window.innerWidth - fab.offsetWidth;
        const maxY = window.innerHeight - fab.offsetHeight;

        currentX = Math.max(0, Math.min(currentX, maxX));
        currentY = Math.max(0, Math.min(currentY, maxY));

        fab.style.left = currentX + 'px';
        fab.style.top = currentY + 'px';
        fab.style.right = 'auto';
        fab.style.bottom = 'auto';
      });

      document.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        fab.style.cursor = 'grab';
        snapFABToEdge(fab);
      });

      document.addEventListener('touchend', () => {
        if (!isDragging) return;
        isDragging = false;
        fab.style.cursor = 'grab';
        snapFABToEdge(fab);
      });

      fab.style.cursor = 'grab';
    }

    function snapFABToEdge(fab) {
      const rect = fab.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const distLeft = centerX;
      const distRight = window.innerWidth - centerX;
      const distTop = centerY;
      const distBottom = window.innerHeight - centerY;

      const minDist = Math.min(distLeft, distRight, distTop, distBottom);
      const padding = 20;

      fab.style.transition = 'all 0.3s ease';

      if (minDist === distLeft) {
        // Snap para esquerda
        fab.style.left = padding + 'px';
        fab.style.top = 'auto';
        fab.style.right = 'auto';
        fab.style.bottom = (window.innerHeight - rect.bottom + window.scrollY) + 'px';
        localStorage.setItem('fabPosition', JSON.stringify({ bottom: padding, right: padding }));
      } else if (minDist === distRight) {
        // Snap para direita
        fab.style.right = padding + 'px';
        fab.style.left = 'auto';
        fab.style.top = 'auto';
        fab.style.bottom = (window.innerHeight - rect.bottom + window.scrollY) + 'px';
        localStorage.setItem('fabPosition', JSON.stringify({ bottom: padding, right: padding }));
      } else if (minDist === distTop) {
        // Snap para cima
        fab.style.top = padding + 'px';
        fab.style.bottom = 'auto';
        fab.style.right = padding + 'px';
        fab.style.left = 'auto';
        localStorage.setItem('fabPosition', JSON.stringify({ bottom: 'auto', right: padding }));
      } else {
        // Snap para baixo (padrão)
        fab.style.bottom = padding + 'px';
        fab.style.right = padding + 'px';
        fab.style.top = 'auto';
        fab.style.left = 'auto';
        localStorage.setItem('fabPosition', JSON.stringify({ bottom: padding, right: padding }));
      }
    }

    function navigateTo(page) {
      const pages = document.querySelectorAll('.page');
      const sidebarItems = document.querySelectorAll('.sidebar-item');
      const fabButton = document.getElementById('fabButton');

      // Remove active class de todas as páginas
      pages.forEach(p => p.classList.remove('active'));
      
      // Remove active class de todos os itens do sidebar
      sidebarItems.forEach(item => item.classList.remove('active'));

      // Adiciona active class à página correta
      const pageElement = document.getElementById(page + 'Page');
      if (pageElement) {
        pageElement.classList.add('active');
      }

      // Mostrar/esconder FAB (esconder apenas em Configurações)
      if (fabButton) {
        fabButton.style.display = page === 'settings' ? 'none' : 'flex';
      }

      // Salva a página atual
      currentPage = page;

      // Se foi para configurações, atualizar dados
      if (page === 'settings') {
        updateSettingsPage();
      }

      updateUI();
    }

    function calculateSimulation() {
      const initialValue = parseFloat(document.getElementById('simulatorInitialValue').value);
      const startDate = new Date(document.getElementById('simulatorStartMonth').value + '-01');
      const endDate = new Date(document.getElementById('simulatorEndMonth').value + '-01');
      const rateType = document.getElementById('simulatorRateType')?.value || 'FIXED';
      const bankId = document.getElementById('simulatorBank')?.value;
      let rateValue = parseFloat(document.getElementById('simulatorInterestRate').value) || 0;

      // Validação
      if (!initialValue || isNaN(initialValue) || initialValue <= 0) {
        showToast('Digite um valor inicial válido.', 'error');
        return;
      }

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        showToast('Selecione o período (data inicial e final).', 'error');
        return;
      }

      if (startDate >= endDate) {
        showToast('A data final deve ser posterior à data inicial.', 'error');
        return;
      }

      // Se for CDI, obter percentual do banco selecionado
      if (rateType === 'CDI' && bankId) {
        const selectedBank = banks.find(b => b.id === bankId);
        if (selectedBank) {
          rateValue = selectedBank.cdi_percentage;
        }
      }

      if (rateValue === 0 || isNaN(rateValue)) {
        showToast('Digite uma taxa válida ou selecione um banco.', 'error');
        return;
      }

      // Calcular resultado baseado no tipo
      let finalValue, interestGained, daysDiff;

      if (rateType === 'CDI') {
        // Cálculo por CDI (252 dias úteis por ano)
        daysDiff = calculateBusinessDays(startDate, endDate);
        
        // CDI diário: (1 + CDI_ANUAL)^(1/252) - 1
        const cdiDaily = Math.pow(1 + (cdiRate / 100), 1 / 252) - 1;
        
        // Rendimento diário com percentual do banco: CDI_DIÁRIO × (percentual / 100)
        const dailyReturn = cdiDaily * (rateValue / 100);
        
        // Montante final: valor_inicial × (1 + rendimento_diário)^dias
        finalValue = initialValue * Math.pow(1 + dailyReturn, daysDiff);
        interestGained = finalValue - initialValue;
      } else {
        // Cálculo por taxa fixa mensal (compatível com anterior)
        const monthsDiff = (endDate.getFullYear() - startDate.getFullYear()) * 12 + 
                          (endDate.getMonth() - startDate.getMonth());
        daysDiff = monthsDiff;
        const rate = rateValue / 100;
        finalValue = initialValue * Math.pow(1 + rate, monthsDiff);
        interestGained = finalValue - initialValue;
      }

      // Atualizar resultados
      document.getElementById('resultInitialValue').textContent = formatCurrency(initialValue);
      document.getElementById('resultInterest').textContent = formatCurrency(interestGained);
      document.getElementById('resultFinalValue').textContent = formatCurrency(finalValue);
      document.getElementById('resultMonths').textContent = daysDiff;
      
      // Calcular rentabilidade em %
      const rentabilityPercent = ((finalValue - initialValue) / initialValue) * 100;
      document.getElementById('resultRentability').textContent = rentabilityPercent.toFixed(2);
      
      // Calcular valor ganho por mês
      const actualMonthsDiff = (endDate.getFullYear() - startDate.getFullYear()) * 12 + 
                               (endDate.getMonth() - startDate.getMonth());
      const monthlyGain = interestGained / Math.max(actualMonthsDiff, 1);
      document.getElementById('resultMonthlyValue').textContent = formatCurrency(monthlyGain);

      // Gerar dados para o gráfico
      generateSimulationChart(initialValue, rateType === 'CDI' ? cdiRate : rateValue, 
                             rateType, startDate, endDate, rateType === 'CDI' ? rateValue : null);

      showToast('Simulação calculada com sucesso!', 'success');
    }

    function calculateBusinessDays(startDate, endDate) {
      let count = 0;
      let current = new Date(startDate);
      
      while (current < endDate) {
        const dayOfWeek = current.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          count++;
        }
        current.setDate(current.getDate() + 1);
      }
      
      return count;
    }

    function calculateSimulationRealtime() {
      const initialValue = parseFloat(document.getElementById('simulatorInitialValue').value) || 0;
      const startMonth = document.getElementById('simulatorStartMonth').value;
      const endMonth = document.getElementById('simulatorEndMonth').value;
      const rateType = document.getElementById('simulatorRateType')?.value || 'FIXED';
      const bankId = document.getElementById('simulatorBank')?.value;
      let rateValue = parseFloat(document.getElementById('simulatorInterestRate').value) || 0;

      // Se for CDI, obter percentual do banco
      if (rateType === 'CDI' && bankId) {
        const selectedBank = banks.find(b => b.id === bankId);
        if (selectedBank) {
          rateValue = selectedBank.cdi_percentage;
        }
      }

      // Se não houver dados completos, limpar os resultados
      if (initialValue <= 0 || rateValue < 0 || !startMonth || !endMonth) {
        document.getElementById('resultInitialValue').textContent = '0,00';
        document.getElementById('resultInterest').textContent = '0,00';
        document.getElementById('resultFinalValue').textContent = '0,00';
        document.getElementById('resultMonths').textContent = '0';
        document.getElementById('resultRentability').textContent = '0,00';
        document.getElementById('resultMonthlyValue').textContent = '0,00';
        document.getElementById('simulationChart').innerHTML = '';
        return;
      }

      const startDate = new Date(startMonth + '-01');
      const endDate = new Date(endMonth + '-01');

      if (startDate >= endDate) {
        document.getElementById('resultInitialValue').textContent = '0,00';
        document.getElementById('resultInterest').textContent = '0,00';
        document.getElementById('resultFinalValue').textContent = '0,00';
        document.getElementById('resultMonths').textContent = '0';
        document.getElementById('resultRentability').textContent = '0,00';
        document.getElementById('resultMonthlyValue').textContent = '0,00';
        document.getElementById('simulationChart').innerHTML = '';
        return;
      }

      // Calcular resultado
      let finalValue, interestGained, daysDiff;

      if (rateType === 'CDI') {
        daysDiff = calculateBusinessDays(startDate, endDate);
        const cdiDaily = Math.pow(1 + (cdiRate / 100), 1 / 252) - 1;
        const dailyReturn = cdiDaily * (rateValue / 100);
        finalValue = initialValue * Math.pow(1 + dailyReturn, daysDiff);
        interestGained = finalValue - initialValue;
      } else {
        const monthsDiff = (endDate.getFullYear() - startDate.getFullYear()) * 12 + 
                          (endDate.getMonth() - startDate.getMonth());
        daysDiff = monthsDiff;
        const rate = rateValue / 100;
        finalValue = initialValue * Math.pow(1 + rate, monthsDiff);
        interestGained = finalValue - initialValue;
      }

      // Atualizar resultados
      document.getElementById('resultInitialValue').textContent = formatCurrency(initialValue);
      document.getElementById('resultInterest').textContent = formatCurrency(interestGained);
      document.getElementById('resultFinalValue').textContent = formatCurrency(finalValue);
      document.getElementById('resultMonths').textContent = daysDiff;
      
      const rentabilityPercent = ((finalValue - initialValue) / initialValue) * 100;
      document.getElementById('resultRentability').textContent = rentabilityPercent.toFixed(2);
      
      // Calcular valor ganho por mês
      const actualMonthsDiff = (endDate.getFullYear() - startDate.getFullYear()) * 12 + 
                               (endDate.getMonth() - startDate.getMonth());
      const monthlyGain = interestGained / Math.max(actualMonthsDiff, 1);
      document.getElementById('resultMonthlyValue').textContent = formatCurrency(monthlyGain);

      // Gerar dados para o gráfico
      generateSimulationChart(initialValue, rateType === 'CDI' ? cdiRate : rateValue, 
                             rateType, startDate, endDate, rateType === 'CDI' ? rateValue : null);
    }

    function generateSimulationChart(initialValue, baseRate, rateType, startDate, endDate, bankPercentage = null) {
      const chartContainer = document.getElementById('simulationChart');
      const data = [];
      
      // Armazenar parâmetros para regeneração ao mudar granularidade
      lastSimulationParams = {
        initialValue,
        baseRate,
        rateType,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        bankPercentage
      };

      const granularity = chartGranularity || 'month';

      if (granularity === 'day') {
        generateChartByDay(data, initialValue, baseRate, rateType, startDate, endDate, bankPercentage);
      } else if (granularity === 'month') {
        generateChartByMonth(data, initialValue, baseRate, rateType, startDate, endDate, bankPercentage);
      } else if (granularity === 'year') {
        generateChartByYear(data, initialValue, baseRate, rateType, startDate, endDate, bankPercentage);
      }

      // Renderizar gráfico
      renderChart(chartContainer, data, initialValue, granularity);
    }

    function generateChartByDay(data, initialValue, baseRate, rateType, startDate, endDate, bankPercentage) {
      let current = new Date(startDate);
      let dayCount = 0;

      if (rateType === 'CDI') {
        const cdiDaily = Math.pow(1 + (baseRate / 100), 1 / 252) - 1;
        const dailyReturn = cdiDaily * (bankPercentage / 100);
        
        while (current < endDate) {
          const dayOfWeek = current.getDay();
          if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            const value = initialValue * Math.pow(1 + dailyReturn, dayCount);
            data.push({ 
              period: dayCount, 
              value: value, 
              label: `Dia ${dayCount + 1}` 
            });
            dayCount++;
          }
          current.setDate(current.getDate() + 1);
        }
      } else {
        // Para taxa fixa, mostrar progressão diária
        const rate = baseRate / 100;
        const dailyRate = Math.pow(1 + rate, 1 / 30) - 1; // Aproximação: 30 dias por mês
        
        while (current < endDate) {
          const value = initialValue * Math.pow(1 + dailyRate, dayCount);
          data.push({ 
            period: dayCount, 
            value: value, 
            label: `Dia ${dayCount + 1}` 
          });
          current.setDate(current.getDate() + 1);
          dayCount++;
        }
      }
    }

    function generateChartByMonth(data, initialValue, baseRate, rateType, startDate, endDate, bankPercentage) {
      let current = new Date(startDate);
      let monthCount = 0;

      if (rateType === 'CDI') {
        const cdiDaily = Math.pow(1 + (baseRate / 100), 1 / 252) - 1;
        const dailyReturn = cdiDaily * (bankPercentage / 100);
        
        while (current < endDate) {
          // Calcular dias úteis acumulados até este mês
          let totalDays = 0;
          let countDate = new Date(startDate);
          while (countDate < new Date(current.getFullYear(), current.getMonth() + 1, 1) && countDate < endDate) {
            const dayOfWeek = countDate.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
              totalDays++;
            }
            countDate.setDate(countDate.getDate() + 1);
          }
          
          const value = initialValue * Math.pow(1 + dailyReturn, totalDays);
          data.push({ 
            month: monthCount, 
            value: value, 
            label: `Mês ${monthCount}` 
          });
          
          current.setMonth(current.getMonth() + 1);
          monthCount++;
        }
      } else {
        const rate = baseRate / 100;
        while (current < endDate) {
          const value = initialValue * Math.pow(1 + rate, monthCount);
          data.push({ 
            month: monthCount, 
            value: value, 
            label: `Mês ${monthCount}` 
          });
          
          current.setMonth(current.getMonth() + 1);
          monthCount++;
        }
      }
    }

    function generateChartByYear(data, initialValue, baseRate, rateType, startDate, endDate, bankPercentage) {
      let current = new Date(startDate);
      let yearCount = 0;

      if (rateType === 'CDI') {
        const cdiDaily = Math.pow(1 + (baseRate / 100), 1 / 252) - 1;
        const dailyReturn = cdiDaily * (bankPercentage / 100);
        
        while (current < endDate) {
          // Calcular dias úteis acumulados até este ano
          let totalDays = 0;
          let countDate = new Date(startDate);
          while (countDate < new Date(current.getFullYear() + 1, 0, 1) && countDate < endDate) {
            const dayOfWeek = countDate.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
              totalDays++;
            }
            countDate.setDate(countDate.getDate() + 1);
          }
          
          const value = initialValue * Math.pow(1 + dailyReturn, totalDays);
          data.push({ 
            year: yearCount, 
            value: value, 
            label: `Ano ${yearCount}` 
          });
          
          current.setFullYear(current.getFullYear() + 1);
          yearCount++;
        }
      } else {
        const rate = baseRate / 100;
        while (current < endDate) {
          const value = initialValue * Math.pow(1 + rate, yearCount * 12);
          data.push({ 
            year: yearCount, 
            value: value, 
            label: `Ano ${yearCount}` 
          });
          
          current.setFullYear(current.getFullYear() + 1);
          yearCount++;
        }
      }
    }

    function renderChart(chartContainer, data, initialValue, granularity) {
      if (data.length === 0) {
        chartContainer.innerHTML = '<div class="text-center text-gray-400 py-8">📊 Selecione um período válido para visualizar o gráfico</div>';
        return;
      }

      const width = chartContainer.offsetWidth || 800;
      const height = 300;
      const padding = 40;
      const innerWidth = width - padding * 2;
      const innerHeight = height - padding * 2;

      const maxValue = data[data.length - 1].value;
      const minValue = initialValue;
      const range = maxValue - minValue || 1;

      // Calcular pontos do gráfico
      const points = data.map((item, i) => {
        const x = (i / (data.length - 1 || 1)) * innerWidth + padding;
        const y = height - padding - ((item.value - minValue) / range) * innerHeight;
        return { x, y, ...item };
      });

      // Criar caminho da linha
      const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

      let html = `
        <div class="relative w-full overflow-x-auto">
          <svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" style="min-width: 100%;">
            <!-- Gradiente de fundo -->
            <defs>
              <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:0.3" />
                <stop offset="100%" style="stop-color:#3b82f6;stop-opacity:0" />
              </linearGradient>
            </defs>

            <!-- Grid horizontal -->
            <g stroke="#374151" stroke-width="0.5" opacity="0.3">
      `;

      // Adicionar linhas de grade
      for (let i = 0; i <= 4; i++) {
        const y = padding + (i / 4) * innerHeight;
        html += `<line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" />`;
      }

      html += `
            </g>

            <!-- Eixo X -->
            <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#6b7280" stroke-width="1" />
            
            <!-- Eixo Y -->
            <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="#6b7280" stroke-width="1" />

            <!-- Área sob a linha -->
            <path d="${pathData} L ${points[points.length - 1].x} ${height - padding} Z" fill="url(#areaGradient)" />

            <!-- Linha principal -->
            <path d="${pathData}" stroke="#3b82f6" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round" />

            <!-- Pontos e hitarea -->
      `;

      points.forEach((point, i) => {
        html += `
          <g class="hover-group" style="cursor: pointer;">
            <circle cx="${point.x}" cy="${point.y}" r="6" fill="#3b82f6" opacity="0" class="hover-circle" />
            <circle cx="${point.x}" cy="${point.y}" r="4" fill="#60a5fa" class="point-inner" />
            <circle cx="${point.x}" cy="${point.y}" r="6" fill="none" stroke="#3b82f6" stroke-width="2" opacity="0" class="hover-ring" />
            
            <!-- Tooltip -->
            <g class="tooltip-group" opacity="0" style="pointer-events: none;">
              <rect x="${point.x - 50}" y="${point.y - 35}" width="100" height="30" rx="4" fill="#1f2937" />
              <text x="${point.x}" y="${point.y - 15}" text-anchor="middle" fill="white" font-size="12" font-weight="bold">${point.label}</text>
              <text x="${point.x}" y="${point.y - 3}" text-anchor="middle" fill="#4ade80" font-size="11">${formatCurrency(point.value)}</text>
            </g>
          </g>
        `;
      });

      html += `
          </svg>
        </div>

        <style>
          .hover-group:hover .hover-circle { opacity: 1 !important; }
          .hover-group:hover .hover-ring { opacity: 1 !important; }
          .hover-group:hover .tooltip-group { opacity: 1 !important; }
        </style>
      `;

      chartContainer.innerHTML = html;
    }

    function changeChartGranularity(granularity) {
      chartGranularity = granularity;
      
      // Atualizar botões
      document.getElementById('filterDay').classList.remove('active-filter');
      document.getElementById('filterMonth').classList.remove('active-filter');
      document.getElementById('filterYear').classList.remove('active-filter');
      
      if (granularity === 'day') {
        document.getElementById('filterDay').classList.add('active-filter');
      } else if (granularity === 'month') {
        document.getElementById('filterMonth').classList.add('active-filter');
      } else if (granularity === 'year') {
        document.getElementById('filterYear').classList.add('active-filter');
      }
      
      // Regenerar gráfico com os últimos parâmetros
      if (Object.keys(lastSimulationParams).length > 0) {
        const params = lastSimulationParams;
        generateSimulationChart(
          params.initialValue, 
          params.baseRate, 
          params.rateType, 
          params.startDate, 
          params.endDate, 
          params.bankPercentage
        );
      }
    }

    function loadSimulatorUI() {
      // Preencher dropdown de bancos
      const bankSelect = document.getElementById('simulatorBank');
      console.log('loadSimulatorUI chamada - bankSelect:', bankSelect, 'banks:', banks);
      if (bankSelect) {
        if (banks.length > 0) {
          bankSelect.innerHTML = '<option value="">-- Personalizado --</option>' + 
            banks.map(b => `<option value="${b.id}">${b.name} (${b.cdi_percentage}% do CDI)</option>`).join('');
          console.log('Select preenchido com', banks.length, 'bancos');
        } else {
          console.warn('Nenhum banco disponível para preencher o select');
          bankSelect.innerHTML = '<option value="">-- Personalizado --</option>';
        }
      } else {
        console.warn('Elemento simulatorBank não encontrado no DOM');
      }

      // Event listener para selecionar banco
      if (bankSelect) {
        bankSelect.addEventListener('change', function() {
          if (this.value) {
            const selectedBank = banks.find(b => b.id === this.value);
            if (selectedBank) {
              document.getElementById('simulatorRateType').value = 'CDI';
              document.getElementById('simulatorInterestRate').value = selectedBank.cdi_percentage;
              calculateSimulationRealtime();
            }
          }
        });
      }

      // Event listener para tipo de taxa
      const rateTypeSelect = document.getElementById('simulatorRateType');
      if (rateTypeSelect) {
        rateTypeSelect.addEventListener('change', function() {
          const interestInput = document.getElementById('simulatorInterestRate');
          if (this.value === 'CDI') {
            interestInput.placeholder = '% do CDI';
            interestInput.value = '';
          } else {
            interestInput.placeholder = '% ao mês';
            interestInput.value = '';
          }
          calculateSimulationRealtime();
        });
      }
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

    // Função para animar números subindo ou descendo
    function animateNumber(element, finalValue, isIncome, duration = 500) {
      const currentValue = parseFloat(element.dataset.value) || 0;
      element.dataset.value = finalValue;
      
      const startTime = Date.now();
      const diff = finalValue - currentValue;
      
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        const currentDisplayValue = currentValue + (diff * progress);
        
        // Extrair apenas a parte numérica para animação visual
        const formattedValue = formatCurrency(currentDisplayValue);
        
        // Se o elemento tem HTML (projeção), preservar a parte do HTML
        if (element.innerHTML.includes('<span')) {
          const htmlPart = element.innerHTML.substring(element.innerHTML.indexOf('<span'));
          element.innerHTML = formattedValue + ' ' + htmlPart;
        } else {
          element.textContent = formattedValue;
        }
        
        // Adicionar classe visual para animação (suave escala)
        if (progress === 0) {
          element.style.transform = 'scale(1)';
        } else if (progress < 0.3) {
          // Animar do valor para cima/baixo (receita sobe, despesa desce)
          const scale = 1 + (isIncome ? -0.1 : 0.1) * (progress / 0.3);
          element.style.transform = `scale(${scale})`;
          element.style.transition = 'none';
        } else {
          element.style.transform = 'scale(1)';
          element.style.transition = 'transform 0.2s ease-out';
        }
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          element.style.transform = 'scale(1)';
          element.style.transition = 'none';
        }
      };
      
      animate();
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

      // Calcula saldo acumulado (receitas - despesas não-crédito + ajustes)
      previousTransactions.forEach(t => {
        if (t.type === 'receita') {
          accumulatedBalance += parseFloat(t.amount);
        } else if (t.type === 'despesa') {
          // Só desconta do saldo se não for compra no crédito (que ainda não foi paga)
          if (t.payment_method !== 'credito') {
            accumulatedBalance -= parseFloat(t.amount);
          }
          // Compras no crédito NÃO descontam do saldo até a fatura ser paga
        } else if (t.type === 'ajuste') {
          // Ajustes são adicionados ao saldo
          accumulatedBalance += parseFloat(t.amount);
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

      // Ajustes do mês (para cálculo de saldo)
      const monthAdjustments = monthTransactions
        .filter(t => t.type === 'ajuste')
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);

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
      // NÃO inclui pagamentos (pagamento_fatura, debito, dinheiro que são pagamentos)
      // porque pagamento não é consumo/despesa, é apenas liquidação de dívida
      // Para evitar contagem dupla: ou conta o gasto EM CRÉDITO ou quando paga, nunca os dois
      const realExpensesTotal = monthTransactions
        .filter(t => {
          // Contar APENAS despesas reais: crédito, débito, dinheiro
          // NÃO contar pagamentos de fatura (porque já contou quando foi gasto em crédito)
          if (t.type !== 'despesa') return false;
          
          // Excluir pagamentos de fatura/recorrente (são liquidações, não gastos)
          if (t.description && (t.description.includes('Pagamento Fatura') || t.description.includes('Pagamento Recorrente'))) {
            return false;
          }
          
          return true;
        })
        .reduce((sum, t) => sum + parseFloat(t.amount), 0) +
        realRecurrings
          .filter(t => {
            if (t.type !== 'despesa') return false;
            if (t.description && (t.description.includes('Pagamento Fatura') || t.description.includes('Pagamento Recorrente'))) {
              return false;
            }
            return true;
          })
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

      // Saldo real do mês (só desconta despesas não-crédito + adiciona ajustes)
      const monthBalance = realIncome - realExpensesForBalance + monthAdjustments;
      let totalBalance = accumulatedBalance + monthBalance;
      
      // Saldo agora é APENAS baseado em transações reais (incluindo ajustes)
      // Os ajustes foram somados acima em accumulatedBalance e monthAdjustments

      // Para o mês ATUAL ou FUTURO, mostra projeções SEPARADAMENTE (apenas futuras)
      let projectedIncome = 0;
      let projectedExpensesTotal = 0;
      let projectedExpensesForBalance = 0;
      let hasProjections = false;

      // Calcular projeções de recorrências para QUALQUER mês
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

      const balanceEl = document.getElementById('totalBalance');
      const incomeEl = document.getElementById('monthIncome');
      const expensesEl = document.getElementById('monthExpenses');

      // SALDO TOTAL (só considera despesas não-crédito)
      if (hasProjections) {
        // Se há projeções de recorrências, mostra o total com projeção
        const projectedBalance = totalBalance + projectedIncome - projectedExpensesForBalance;
        if (isFutureMonth) {
          // Para meses futuros, mostra como "Projetado"
          balanceEl.innerHTML = `${formatCurrency(projectedBalance)} <span class="text-xs text-blue-400 ml-1">📊 Projetado</span>`;
          animateNumber(balanceEl, projectedBalance, projectedBalance >= 0);
        } else if (isCurrentMonth) {
          // Para mês atual, mostra "X (Y projetado)"
          balanceEl.innerHTML = `${formatCurrency(totalBalance)} <span class="text-xs text-gray-500 ml-1">(${formatCurrency(projectedBalance)} projetado)</span>`;
          animateNumber(balanceEl, totalBalance, totalBalance >= 0);
        } else {
          // Para meses passados, mostra o saldo real com a nota de recorrências
          balanceEl.innerHTML = `${formatCurrency(totalBalance)} <span class="text-xs text-gray-500 ml-1">(com recorrências)</span>`;
          animateNumber(balanceEl, totalBalance, totalBalance >= 0);
        }
        // Mudar cor baseado no saldo
        if (totalBalance < 0) {
          balanceEl.className = 'text-3xl font-bold text-red-500';
        } else {
          balanceEl.className = 'text-3xl font-bold text-green-500';
        }
      } else {
        // Sem projeções, mostra apenas o saldo real
        balanceEl.textContent = formatCurrency(totalBalance);
        animateNumber(balanceEl, totalBalance, totalBalance >= 0);
        // Mudar cor baseado no saldo real
        if (totalBalance < 0) {
          balanceEl.className = 'text-3xl font-bold text-red-500';
        } else {
          balanceEl.className = 'text-3xl font-bold text-green-500';
        }
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
        animateNumber(incomeEl, totalIncome, true);
        
        if (realExpensesTotal > 0) {
          expensesEl.innerHTML = `${formatCurrency(totalExpenses)} <span class="text-xs text-gray-500 ml-1">(${formatCurrency(realExpensesTotal)} real + <span class="text-blue-400">${formatCurrency(projectedExpensesTotal)} 📊</span>)</span>`;
        } else {
          expensesEl.innerHTML = `${formatCurrency(totalExpenses)} <span class="text-xs text-blue-400 ml-1">📊 Projetado</span>`;
        }
        animateNumber(expensesEl, totalExpenses, false);
      } else if (isFutureMonth) {
        // Mês futuro sem recorrências - mostra apenas as transações reais já cadastradas
        incomeEl.innerHTML = `${formatCurrency(realIncome)} ${realIncome > 0 ? '<span class="text-xs text-blue-400 ml-1">📊 Projetado</span>' : ''}`;
        animateNumber(incomeEl, realIncome, true);
        expensesEl.innerHTML = `${formatCurrency(realExpensesTotal)} ${realExpensesTotal > 0 ? '<span class="text-xs text-blue-400 ml-1">📊 Projetado</span>' : ''}`;
        animateNumber(expensesEl, realExpensesTotal, false);
      } else {
        incomeEl.textContent = formatCurrency(realIncome);
        animateNumber(incomeEl, realIncome, true);
        expensesEl.textContent = formatCurrency(realExpensesTotal);
        animateNumber(expensesEl, realExpensesTotal, false);
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
      // Procura pela descrição "Pagamento Fatura" em vez do payment_method
      const paymentsThisMonth = transactions
        .filter(t => {
          if (!t.description || !t.description.includes(`Pagamento Fatura - ${card.name}`)) {
            return false;
          }
          
          const tDate = new Date(t.date + 'T00:00:00');
          return tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear;
        })
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);

      blockedLimit -= paymentsThisMonth;
      
      console.log(`💳 ${card.name}: Bloqueado=${blockedLimit + paymentsThisMonth}, Pagamentos=${paymentsThisMonth}, Disponível=${Math.max(0, blockedLimit)}`);
      
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
      
      // Subtrair pagamentos já feitos no mês atual (procura pela descrição que começa com "Pagamento Fatura")
      const paymentPattern = `Pagamento Fatura - ${card.name}`;
      const paymentsThisMonth = transactions
        .filter(t => {
          if (!t.description || !t.description.includes(paymentPattern)) {
            return false;
          }
          
          const tDate = new Date(t.date + 'T00:00:00');
          return tDate.getMonth() === now.getMonth() && tDate.getFullYear() === now.getFullYear();
        })
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);
      
      const totalInvoice = realTransactions + recurringTransactions - paymentsThisMonth;
      
      // Debug
      if (paymentsThisMonth > 0 || realTransactions > 0 || recurringTransactions > 0) {
        console.log(`📊 Fatura ${card.name}: Real=${realTransactions}, Recorrente=${recurringTransactions}, Pagamentos=${paymentsThisMonth}, Total=${totalInvoice}`);
      }
      
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
      // Obter recorrências projetadas para QUALQUER mês (não só meses futuros)
      projectedRecurrings = getProjectedRecurringTransactions(viewMonth, viewYear);

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
          label = '<span class="badge-status">Fatura</span>';
        } else if (isInvoicePayment) {
          color = 'text-blue-500';
          icon = '💰';
          label = '<span class="badge-status">Pagamento</span>';
        } else {
          color = 'text-red-500';
          icon = '↓';
          label = '';
        }
        
        const projectedClass = isProjected ? 'projected' : '';
        const projectedLabel = isProjected ? '<span class="badge-projected">📊 Projeção</span>' : '';
        
        return `
          <div class="transaction-item ${projectedClass}">
            <div class="transaction-header">
              <div class="transaction-icon ${color}">${icon}</div>
              <div class="transaction-main">
                <div class="transaction-title-row">
                  <h4 class="transaction-description">${t.description}</h4>
                  ${label}${projectedLabel}
                </div>
                <div class="transaction-meta">
                  <span class="meta-item">${formatDate(t.date)}</span>
                  <span class="meta-separator">•</span>
                  <span class="meta-item">${t.category}</span>
                  ${t.payment_method && !isInvoicePayment ? `<span class="meta-separator">•</span><span class="meta-item">${t.payment_method}</span>` : ''}
                  ${t.installments > 1 ? `<span class="meta-separator">•</span><span class="meta-item">P${t.current_installment}/${t.installments}</span>` : ''}
                </div>
              </div>
              <div class="transaction-amount ${color}">
                ${isIncome ? '+' : isCreditPurchase ? '' : '-'}${formatCurrency(t.amount)}
              </div>
            </div>
            ${!isProjected ? `
              <div class="transaction-actions">
                <button onclick="openEditTransactionModal('${t.id}')" class="action-btn edit-btn" title="Editar">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
                </button>
                <button onclick="deleteTransaction('${t.id}', '${t.description.replace(/'/g, "\\'")}', ${t.installments}, ${t.current_installment})" class="action-btn delete-btn" title="Deletar">
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 5H17M15 5V16C15 16.5523 14.5523 17 14 17H6C5.44772 17 5 16.5523 5 16V5M7 5V4C7 3.44772 7.44772 3 8 3H12C12.5523 3 13 3.44772 13 4V5M8 9V13M12 9V13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                </button>
              </div>
            ` : ''}
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
            <div class="flex items-center gap-2">
              <h3 class="text-lg font-semibold text-white">${card.name}</h3>
              <button onclick="openAdjustInvoiceModal(${card.id}, ${currentMonthInvoice}, '${card.name}')" class="text-yellow-500 hover:text-yellow-400 transition p-1 hover:bg-yellow-900 hover:bg-opacity-20 rounded" title="Ajustar fatura">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
                </svg>
              </button>
            </div>
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
            
            <button onclick="openEditCardModal(${card.id})" class="text-blue-500 hover:text-blue-400 transition p-2 hover:bg-blue-900 hover:bg-opacity-20 rounded" title="Editar cartão">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
              </svg>
            </button>
            
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
            <div class="flex gap-2">
              <button onclick="openEditCardModal(${card.id})" class="flex-1 text-blue-500 hover:text-blue-400 transition p-2 hover:bg-blue-900 hover:bg-opacity-20 rounded text-xs font-semibold" title="Editar cartão">
                ✎️ Editar
              </button>
              <button onclick="deleteCard(${card.id}, '${card.name}')" class="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold py-2 px-3 rounded-lg transition-colors duration-200">
                🗑️ Excluir
              </button>
            </div>
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

      // Detectar tema
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark' || document.documentElement.getAttribute('data-theme') === null;

      container.innerHTML = goals.map(goal => {
        const progress = (goal.current_amount / goal.target_amount) * 100;
        const isCompleted = goal.current_amount >= goal.target_amount;
        const remaining = goal.target_amount - goal.current_amount;
        const daysRemaining = goal.deadline ? Math.ceil((new Date(goal.deadline) - new Date()) / (1000 * 60 * 60 * 24)) : null;
        const isOverdue = daysRemaining !== null && daysRemaining < 0;
        const isNearDeadline = daysRemaining !== null && daysRemaining > 0 && daysRemaining <= 30;

        const statusBorderColor = isCompleted ? 'border-l-green-500' : 
                                  isOverdue ? 'border-l-red-500' : 
                                  isNearDeadline ? 'border-l-yellow-500' : 
                                  'border-l-blue-500';

        const progressColor = isCompleted ? '#10b981' :
                             progress >= 75 ? '#3b82f6' :
                             progress >= 50 ? '#06b6d4' :
                             progress >= 25 ? '#eab308' : '#f97316';

        const statusBadgeColor = isCompleted ? '#10b981' : 
                                 isOverdue ? '#ef4444' : 
                                 isNearDeadline ? '#eab308' : '';

        return `
          <div class="goal-item border-l-4 ${statusBorderColor}" style="background-color: ${isDark ? '#1a1a1a' : '#f9fafb'}; border-color: ${isDark ? '#2a2a2a' : '#e5e7eb'};">
            <div class="goal-header">
              <div class="goal-main">
                <div class="goal-title-row">
                  <h3 class="goal-title" style="color: ${isDark ? '#ffffff' : '#111827'}">${goal.name}</h3>
                  ${isCompleted ? `<span class="goal-badge completed">✓</span>` : isOverdue ? `<span class="goal-badge overdue">⚠️</span>` : isNearDeadline ? `<span class="goal-badge deadline">${daysRemaining}d</span>` : ''}
                </div>
                <div class="goal-meta" style="color: ${isDark ? '#999999' : '#6b7280'}">${daysRemaining !== null ? (isOverdue ? `${Math.abs(daysRemaining)}d atrás` : `${daysRemaining}d restante`) : 'Sem prazo'}</div>
              </div>
              <div class="goal-actions">
                <button onclick="openEditGoalModal(${goal.id})" class="action-btn edit-btn" title="Editar">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
                  </svg>
                </button>
                <button onclick="deleteGoal(${goal.id}, '${goal.name}')" class="action-btn delete-btn" title="Excluir">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 6h18"/><path d="M8 6v12c0 1.1.9 2 2 2h4c1.1 0 2-.9 2-2V6"/>
                  </svg>
                </button>
              </div>
            </div>

            <div class="goal-values">
              <div class="goal-value-item">
                <span class="goal-value-label">Acum</span>
                <span class="goal-value-amount" style="color: #10b981">${formatCurrency(goal.current_amount)}</span>
              </div>
              <div class="goal-value-item">
                <span class="goal-value-label">Meta</span>
                <span class="goal-value-amount" style="color: #3b82f6">${formatCurrency(goal.target_amount)}</span>
              </div>
              <div class="goal-value-item">
                <span class="goal-value-label">${isCompleted ? '+' : 'Falta'}</span>
                <span class="goal-value-amount" style="color: ${isCompleted ? '#10b981' : '#f97316'}">${formatCurrency(Math.abs(remaining))}</span>
              </div>
            </div>

            <div class="goal-progress">
              <div class="goal-progress-bar-container">
                <div class="goal-progress-bar" style="width: ${Math.min(progress, 100)}%; background-color: ${progressColor}; box-shadow: 0 0 6px ${progressColor}40;"></div>
              </div>
              <span class="goal-progress-text">${progress.toFixed(0)}%</span>
            </div>

            <div class="goal-footer">
              <button onclick="addGoalAmount(${goal.id}, '${goal.name}')" class="goal-btn add-btn">
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M10 5V15M5 10H15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
                Adicionar
              </button>
              <button onclick="withdrawGoalAmount(${goal.id}, '${goal.name}')" class="goal-btn withdraw-btn">
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M5 10H15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
                Retirar
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    function renderGoalsPreview() {
      const container = document.getElementById('goalsPreview');
      const preview = goals.slice(0, 4);

      if (preview.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-center py-4">Nenhuma meta cadastrada</p>';
        return;
      }

      container.innerHTML = preview.map(goal => {
        const progress = (goal.current_amount / goal.target_amount) * 100;
        const isCompleted = goal.current_amount >= goal.target_amount;
        const remaining = goal.target_amount - goal.current_amount;
        const daysRemaining = goal.deadline ? Math.ceil((new Date(goal.deadline) - new Date()) / (1000 * 60 * 60 * 24)) : null;
        
        const progressColor = isCompleted ? 'from-green-500 to-green-600' :
                             progress >= 75 ? 'from-blue-500 to-blue-600' :
                             progress >= 50 ? 'from-cyan-500 to-cyan-600' :
                             progress >= 25 ? 'from-yellow-500 to-yellow-600' : 'from-orange-500 to-orange-600';

        return `
          <div class="bg-gradient-to-br ${progressColor} rounded-lg p-3 mb-3 last:mb-0 text-white shadow-lg hover:shadow-xl transition-shadow">
            <div class="flex items-center justify-between mb-2">
              <h4 class="font-bold text-sm truncate">${goal.name}</h4>
              <span class="text-xs font-bold bg-white bg-opacity-20 px-2 py-1 rounded">${progress.toFixed(0)}%</span>
            </div>
            <div class="w-full bg-white bg-opacity-20 rounded-full h-2 mb-2 overflow-hidden">
              <div class="h-full bg-white rounded-full" style="width: ${Math.min(progress, 100)}%; opacity: 0.8;"></div>
            </div>
            <div class="flex items-center justify-between text-xs">
              <span>${formatCurrency(goal.current_amount)} / ${formatCurrency(goal.target_amount)}</span>
              ${daysRemaining !== null ? `
                <span class="font-semibold">${daysRemaining > 0 ? daysRemaining + 'd' : 'Vencida'}</span>
              ` : ''}
            </div>
          </div>
        `;
      }).join('');
    }

    function renderAchievements() {
      const container = document.getElementById('achievementsList');
      const parentContainer = document.getElementById('achievementsContainer');

      const achievements = [
        { id: 1, name: 'Primeira Transação', description: 'Registre sua primeira transação', unlocked: transactions.length >= 1, icon: '💰', rarity: 'comum', color: 'from-blue-600 to-blue-700' },
        { id: 2, name: 'Organizador', description: 'Registre 10 transações', unlocked: transactions.length >= 10, icon: '📊', rarity: 'comum', color: 'from-green-600 to-green-700' },
        { id: 3, name: 'Disciplinado', description: 'Registre 50 transações', unlocked: transactions.length >= 50, icon: '💪', rarity: 'raro', color: 'from-purple-600 to-purple-700' },
        { id: 4, name: 'Carteirinha', description: 'Cadastre seu primeiro cartão', unlocked: cards.length >= 1, icon: '💳', rarity: 'comum', color: 'from-yellow-600 to-yellow-700' },
        { id: 5, name: 'Sonhador', description: 'Crie sua primeira meta', unlocked: goals.length >= 1, icon: '🎯', rarity: 'comum', color: 'from-pink-600 to-pink-700' },
        { id: 6, name: 'Realizador', description: 'Complete uma meta', unlocked: goals.some(g => g.current_amount >= g.target_amount), icon: '🏆', rarity: 'épico', color: 'from-orange-600 to-orange-700' },
        { id: 7, name: 'No Azul', description: 'Tenha saldo positivo no mês', unlocked: checkPositiveBalance(), icon: '💚', rarity: 'raro', color: 'from-emerald-600 to-emerald-700' },
        { id: 8, name: 'Investidor', description: 'Registre uma receita de investimento', unlocked: transactions.some(t => t.category === 'Investimento'), icon: '📈', rarity: 'épico', color: 'from-cyan-600 to-cyan-700' },
        { id: 9, name: 'Economista', description: 'Registre 100 transações', unlocked: transactions.length >= 100, icon: '💵', rarity: 'raro', color: 'from-green-500 to-green-700' },
        { id: 10, name: 'Estrategista', description: 'Crie 5 metas', unlocked: goals.length >= 5, icon: '🎲', rarity: 'raro', color: 'from-indigo-600 to-indigo-700' },
        { id: 11, name: 'Executivo', description: 'Complete 3 metas', unlocked: goals.filter(g => g.current_amount >= g.target_amount).length >= 3, icon: '👔', rarity: 'épico', color: 'from-slate-600 to-slate-700' },
        { id: 12, name: 'Colecionador', description: 'Cadastre 3 cartões diferentes', unlocked: cards.length >= 3, icon: '💎', rarity: 'raro', color: 'from-pink-500 to-pink-700' },
        { id: 13, name: 'Controlador', description: 'Categorize todas as transações', unlocked: transactions.every(t => t.category), icon: '✅', rarity: 'raro', color: 'from-green-600 to-emerald-700' },
        { id: 14, name: 'Milionário', description: 'Registre 500 transações', unlocked: transactions.length >= 500, icon: '🤑', rarity: 'épico', color: 'from-yellow-600 to-yellow-500' },
        { id: 15, name: 'Consistente', description: 'Registre transações por 30 dias', unlocked: transactions.length >= 30, icon: '📅', rarity: 'raro', color: 'from-red-600 to-pink-700' },
        { id: 16, name: 'Responsável', description: 'Registre uma meta com alta prioridade', unlocked: goals.some(g => g.priority === 3), icon: '⚡', rarity: 'comum', color: 'from-yellow-600 to-orange-700' },
        { id: 17, name: 'Audacioso', description: 'Crie uma meta com mais de 1000', unlocked: goals.some(g => g.target_amount > 1000), icon: '🚀', rarity: 'raro', color: 'from-purple-600 to-blue-700' },
        { id: 18, name: 'Perspicaz', description: 'Registre 10 transações recorrentes', unlocked: recurringTransactions.length >= 10, icon: '🔄', rarity: 'raro', color: 'from-teal-600 to-cyan-700' },
        { id: 19, name: 'Visionário', description: 'Crie 10 metas diferentes', unlocked: goals.length >= 10, icon: '👁️', rarity: 'épico', color: 'from-indigo-600 to-purple-700' },
        { id: 20, name: 'Lenda Financeira', description: 'Desbloqueie todas as conquistas', unlocked: false, icon: '👑', rarity: 'épico', color: 'from-orange-500 to-red-600' }
      ];

      const unlockedCount = achievements.filter(a => a.unlocked).length;
      const completionPercent = Math.round((unlockedCount / achievements.length) * 100);
      const itemsPerPage = 8;
      const totalPages = Math.ceil(achievements.length / itemsPerPage);
      const startIndex = achievementsPage * itemsPerPage;
      const endIndex = startIndex + itemsPerPage;
      const paginatedAchievements = achievements.slice(startIndex, endIndex);

      let html = `
        <!-- Progress Section -->
        <div class="mb-8 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 rounded-2xl p-6 border border-gray-700 shadow-lg">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="text-2xl font-bold text-white mb-1">Progresso de Conquistas</h3>
              <p class="text-sm text-gray-400">Avance seu caminho para a excelência financeira</p>
            </div>
            <div class="text-right">
              <div class="text-3xl font-black bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
                ${completionPercent}%
              </div>
              <p class="text-xs text-gray-400 mt-1">${unlockedCount} de ${achievements.length}</p>
            </div>
          </div>
          
          <div class="relative w-full h-3 bg-gray-700 rounded-full overflow-hidden shadow-inner">
            <div class="absolute inset-0 bg-gradient-to-r from-green-500 via-blue-500 to-purple-500 rounded-full transition-all duration-700 ease-out" style="width: ${completionPercent}%"></div>
          </div>
          
          <div class="flex justify-between mt-4">
            <div class="text-center">
              <div class="text-sm font-bold text-green-400">${unlockedCount}</div>
              <div class="text-xs text-gray-500">Desbloqueadas</div>
            </div>
            <div class="text-center">
              <div class="text-sm font-bold text-yellow-400">${achievements.filter(a => a.rarity === 'raro').filter(a => a.unlocked).length}</div>
              <div class="text-xs text-gray-500">Raras</div>
            </div>
            <div class="text-center">
              <div class="text-sm font-bold text-purple-400">${achievements.filter(a => a.rarity === 'épico').filter(a => a.unlocked).length}</div>
              <div class="text-xs text-gray-500">Épicas</div>
            </div>
            <div class="text-center">
              <div class="text-sm font-bold text-gray-400">${achievements.length - unlockedCount}</div>
              <div class="text-xs text-gray-500">Bloqueadas</div>
            </div>
          </div>
        </div>

        <!-- Achievements Grid -->
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5 mb-8">
      `;

      html += paginatedAchievements.map((ach, index) => {
        const rarityEmoji = ach.rarity === 'épico' ? '⭐⭐⭐' : ach.rarity === 'raro' ? '⭐⭐' : '⭐';
        const rarityLabel = ach.rarity === 'épico' ? 'Épica' : ach.rarity === 'raro' ? 'Rara' : 'Comum';
        const rarityColor = ach.rarity === 'épico' ? 'from-yellow-500 to-orange-500' : ach.rarity === 'raro' ? 'from-purple-500 to-pink-500' : 'from-blue-500 to-cyan-500';

        return `
          <div class="group relative transform transition-all duration-300 hover:scale-105 ${!ach.unlocked ? 'opacity-70' : 'hover:shadow-2xl'}">
            <div class="absolute inset-0 bg-gradient-to-r ${!ach.unlocked ? 'from-gray-800 to-gray-900' : ach.color} rounded-xl blur opacity-30 group-hover:opacity-60 transition duration-500"></div>
            
            <div class="relative bg-gray-900 border-2 ${!ach.unlocked ? 'border-gray-700' : `border-transparent bg-gradient-to-br ${ach.color} p-0.5`} rounded-xl overflow-hidden">
              <div class="bg-gray-900 rounded-[9px] p-5 h-full flex flex-col">
                <!-- Header with Icon and Status -->
                <div class="flex items-start justify-between mb-4">
                  <div class="relative">
                    <div class="text-6xl filter transition-all duration-300 ${!ach.unlocked ? 'grayscale opacity-50' : 'drop-shadow-lg'}">
                      ${ach.unlocked ? ach.icon : '🔒'}
                    </div>
                    ${ach.unlocked && ach.rarity === 'épico' ? `
                      <div class="absolute -top-2 -right-2 animate-bounce">
                        <div class="text-2xl">✨</div>
                      </div>
                    ` : ''}
                  </div>
                  
                  <span class="inline-block bg-gradient-to-r ${rarityColor} text-white text-xs font-bold px-2 py-1 rounded-lg">
                    ${ach.unlocked ? rarityEmoji : 'BLOQ'}
                  </span>
                </div>
                
                <!-- Title and Rarity -->
                <h4 class="font-bold text-sm ${ach.unlocked ? 'text-white' : 'text-gray-500'} mb-1 line-clamp-2">${ach.name}</h4>
                <p class="text-xs ${ach.unlocked ? `text-gray-300 bg-gradient-to-r ${rarityColor} bg-clip-text text-transparent` : 'text-gray-600'} font-semibold mb-3">
                  ${ach.unlocked ? rarityLabel : 'Bloqueada'}
                </p>
                
                <!-- Description -->
                <p class="text-xs ${ach.unlocked ? 'text-gray-400' : 'text-gray-600'} mb-4 flex-grow line-clamp-2">${ach.description}</p>
                
                <!-- Status Footer -->
                <div class="pt-3 border-t border-gray-800">
                  ${ach.unlocked ? `
                    <div class="flex items-center gap-2 text-xs font-semibold text-green-400">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="12" cy="12" r="10" fill="currentColor"/>
                        <path d="M8 12L11 15L16 9" stroke="#111827" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                      <span>Desbloqueada!</span>
                    </div>
                  ` : `
                    <div class="text-xs text-gray-500 font-medium">Trabalhe para desbloquear</div>
                  `}
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('');

      html += `
        </div>
      `;

      // Pagination Controls
      if (totalPages > 1) {
        html += `
          <div class="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10 pt-8 border-t border-gray-800">
            <button 
              onclick="previousAchievementsPage()" 
              class="flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all duration-300 ${
                achievementsPage === 0 
                  ? 'bg-gray-800 text-gray-600 cursor-not-allowed opacity-50' 
                  : 'bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:shadow-lg hover:shadow-blue-500/50'
              }">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
              Anterior
            </button>
            
            <div class="flex items-center gap-4">
              <div class="text-sm font-bold">
                <span class="text-white">Página ${achievementsPage + 1}</span>
                <span class="text-gray-500"> de ${totalPages}</span>
              </div>
              <div class="h-8 w-px bg-gray-700"></div>
              <div class="text-sm text-gray-400">
                ${startIndex + 1}–${Math.min(endIndex, achievements.length)} de ${achievements.length}
              </div>
            </div>
            
            <button 
              onclick="nextAchievementsPage()" 
              class="flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all duration-300 ${
                achievementsPage === totalPages - 1 
                  ? 'bg-gray-800 text-gray-600 cursor-not-allowed opacity-50' 
                  : 'bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:shadow-lg hover:shadow-blue-500/50'
              }">
              Próxima
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>
          </div>
        `;
      }

      container.innerHTML = html;
    }

    function nextAchievementsPage() {
      const achievements = [
        { id: 1, name: 'Primeira Transação', description: 'Registre sua primeira transação', unlocked: transactions.length >= 1, icon: '💰', rarity: 'comum', color: 'from-blue-600 to-blue-700' },
        { id: 2, name: 'Organizador', description: 'Registre 10 transações', unlocked: transactions.length >= 10, icon: '📊', rarity: 'comum', color: 'from-green-600 to-green-700' },
        { id: 3, name: 'Disciplinado', description: 'Registre 50 transações', unlocked: transactions.length >= 50, icon: '💪', rarity: 'raro', color: 'from-purple-600 to-purple-700' },
        { id: 4, name: 'Carteirinha', description: 'Cadastre seu primeiro cartão', unlocked: cards.length >= 1, icon: '💳', rarity: 'comum', color: 'from-yellow-600 to-yellow-700' },
        { id: 5, name: 'Sonhador', description: 'Crie sua primeira meta', unlocked: goals.length >= 1, icon: '🎯', rarity: 'comum', color: 'from-pink-600 to-pink-700' },
        { id: 6, name: 'Realizador', description: 'Complete uma meta', unlocked: goals.some(g => g.current_amount >= g.target_amount), icon: '🏆', rarity: 'épico', color: 'from-orange-600 to-orange-700' },
        { id: 7, name: 'No Azul', description: 'Tenha saldo positivo no mês', unlocked: checkPositiveBalance(), icon: '💚', rarity: 'raro', color: 'from-emerald-600 to-emerald-700' },
        { id: 8, name: 'Investidor', description: 'Registre uma receita de investimento', unlocked: transactions.some(t => t.category === 'Investimento'), icon: '📈', rarity: 'épico', color: 'from-cyan-600 to-cyan-700' },
        { id: 9, name: 'Economista', description: 'Registre 100 transações', unlocked: transactions.length >= 100, icon: '💵', rarity: 'raro', color: 'from-green-500 to-green-700' },
        { id: 10, name: 'Estrategista', description: 'Crie 5 metas', unlocked: goals.length >= 5, icon: '🎲', rarity: 'raro', color: 'from-indigo-600 to-indigo-700' },
        { id: 11, name: 'Executivo', description: 'Complete 3 metas', unlocked: goals.filter(g => g.current_amount >= g.target_amount).length >= 3, icon: '👔', rarity: 'épico', color: 'from-slate-600 to-slate-700' },
        { id: 12, name: 'Colecionador', description: 'Cadastre 3 cartões diferentes', unlocked: cards.length >= 3, icon: '💎', rarity: 'raro', color: 'from-pink-500 to-pink-700' },
        { id: 13, name: 'Controlador', description: 'Categorize todas as transações', unlocked: transactions.every(t => t.category), icon: '✅', rarity: 'raro', color: 'from-green-600 to-emerald-700' },
        { id: 14, name: 'Milionário', description: 'Registre 500 transações', unlocked: transactions.length >= 500, icon: '🤑', rarity: 'épico', color: 'from-yellow-600 to-yellow-500' },
        { id: 15, name: 'Consistente', description: 'Registre transações por 30 dias', unlocked: transactions.length >= 30, icon: '📅', rarity: 'raro', color: 'from-red-600 to-pink-700' },
        { id: 16, name: 'Responsável', description: 'Registre uma meta com alta prioridade', unlocked: goals.some(g => g.priority === 3), icon: '⚡', rarity: 'comum', color: 'from-yellow-600 to-orange-700' },
        { id: 17, name: 'Audacioso', description: 'Crie uma meta com mais de 1000', unlocked: goals.some(g => g.target_amount > 1000), icon: '🚀', rarity: 'raro', color: 'from-purple-600 to-blue-700' },
        { id: 18, name: 'Perspicaz', description: 'Registre 10 transações recorrentes', unlocked: recurringTransactions.length >= 10, icon: '🔄', rarity: 'raro', color: 'from-teal-600 to-cyan-700' },
        { id: 19, name: 'Visionário', description: 'Crie 10 metas diferentes', unlocked: goals.length >= 10, icon: '👁️', rarity: 'épico', color: 'from-indigo-600 to-purple-700' },
        { id: 20, name: 'Lenda Financeira', description: 'Desbloqueie todas as conquistas', unlocked: false, icon: '👑', rarity: 'épico', color: 'from-orange-500 to-red-600' }
      ];
      const itemsPerPage = 12;
      const totalPages = Math.ceil(achievements.length / itemsPerPage);
      if (achievementsPage < totalPages - 1) {
        achievementsPage++;
        renderAchievements();
      }
    }

    function previousAchievementsPage() {
      if (achievementsPage > 0) {
        achievementsPage--;
        renderAchievements();
      }
    }

    function checkPositiveBalance() {
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      const monthTransactions = transactions.filter(t => {
        const tDate = new Date(t.date + 'T00:00:00');
        return tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear && t.type !== 'ajuste';
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
          
          expirationInfo = `<span class="recurring-expires">${monthsLeft}m</span>`;
        }

        const durationBadge = isPermanent ? 
          '<span class="recurring-badge permanent">♾️</span>' : 
          '<span class="recurring-badge temporary">⏰</span>';

        return `
          <div class="recurring-item">
            <div class="recurring-header">
              <div class="recurring-icon ${color}">${icon}</div>
              <div class="recurring-main">
                <div class="recurring-title">${r.description}</div>
                <div class="recurring-meta">
                  <span>${r.category}</span>
                  <span>•</span>
                  <span>D${r.day_of_month}</span>
                  ${expirationInfo}
                </div>
              </div>
              <div class="recurring-badge-container">
                ${durationBadge}
              </div>
            </div>
            <div class="recurring-footer">
              <div class="recurring-amount ${color}">
                ${isIncome ? '+' : '-'}${formatCurrency(r.amount)}
              </div>
              <div class="recurring-actions">
                <button onclick="openEditRecurringModal(${r.id})" class="action-btn edit-btn" title="Editar">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
                </button>
                <button onclick="deleteRecurring(${r.id}, '${r.description}')" class="action-btn delete-btn" title="Deletar">
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 5H17M15 5V16C15 16.5523 14.5523 17 14 17H6C5.44772 17 5 16.5523 5 16V5M7 5V4C7 3.44772 7.44772 3 8 3H12C12.5523 3 13 3.44772 13 4V5M8 9V13M12 9V13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
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
      buildDescriptionSuggestions();
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

    async function openEditRecurringModal(recurringId) {
      const recurring = recurringTransactions.find(r => r.id === recurringId);
      if (!recurring) return;

      // Preencher ID
      document.getElementById('editRecurringId').value = recurring.id;

      // Preencher tipo
      selectEditRecurringType(recurring.type);
      document.getElementById('editRecurringType').value = recurring.type;

      // Preencher descrição
      document.getElementById('editRecurringDescription').value = recurring.description || '';

      // Preencher valor
      document.getElementById('editRecurringAmount').value = recurring.amount;

      // Preencher categoria
      document.getElementById('editRecurringCategory').value = recurring.category || '';

      // Preencher cartão
      const cardMappings = JSON.parse(localStorage.getItem('recurring_card_mappings') || '{}');
      const cardId = cardMappings[recurringId];

      if (recurring.type === 'receita') {
        document.getElementById('editRecurringCardSelectionIncome').value = cardId || '';
      } else {
        document.getElementById('editRecurringCardSelection').value = cardId || '';
      }

      // Preencher data de início
      document.getElementById('editRecurringStartDate').value = recurring.start_date || new Date().toISOString().split('T')[0];

      // Preencher dia do mês
      document.getElementById('editRecurringDay').value = recurring.day_of_month;

      // Preencher duração
      const durationValue = recurring.duration_type === 'temporary' ? 'temporary' : 'permanent';
      selectEditRecurringDuration(durationValue);
      document.getElementById('editRecurringDuration').value = durationValue;

      if (recurring.duration_months) {
        document.getElementById('editDurationMonths').value = recurring.duration_months;
      }

      // Atualizar dropdowns
      updateEditRecurringCardOptions();
      updateEditRecurringCardSelectionOptions();
      updateEditRecurringCategoryOptions();

      // Abrir modal
      document.getElementById('editRecurringModal').classList.add('active');
    }

    function closeEditRecurringModal() {
      document.getElementById('editRecurringModal').classList.remove('active');
      document.getElementById('editRecurringForm').reset();
    }

    function selectEditRecurringType(type) {
      document.getElementById('editRecurringType').value = type;
      const recebitBtn = document.getElementById('editBtnReceitaRecurring');
      const despesaBtn = document.getElementById('editBtnDespesaRecurring');
      const cardSection = document.getElementById('editRecurringCardSelectionSection');
      const cardSectionIncome = document.getElementById('editRecurringCardSelectionSectionIncome');

      if (type === 'receita') {
        recebitBtn.classList.add('btn-income-selected');
        recebitBtn.classList.remove('btn-recurring-type');
        despesaBtn.classList.remove('btn-income-selected');
        despesaBtn.classList.add('btn-recurring-type');
        cardSection.style.display = 'none';
        cardSectionIncome.style.display = 'block';
      } else {
        despesaBtn.classList.add('btn-income-selected');
        despesaBtn.classList.remove('btn-recurring-type');
        recebitBtn.classList.remove('btn-income-selected');
        recebitBtn.classList.add('btn-recurring-type');
        cardSection.style.display = 'block';
        cardSectionIncome.style.display = 'none';
      }

      // Atualizar categorias quando tipo muda
      updateEditRecurringCategoryOptions();
    }

    function selectEditRecurringDuration(type) {
      document.getElementById('editRecurringDuration').value = type;
      const permanentBtn = document.getElementById('editBtnPermanent');
      const temporaryBtn = document.getElementById('editBtnTemporary');
      const durationSection = document.getElementById('editDurationMonthsSection');

      // Remove classes de ambos os botões
      permanentBtn.classList.remove('btn-income-selected', 'btn-expense-selected');
      temporaryBtn.classList.remove('btn-income-selected', 'btn-expense-selected');

      if (type === 'temporary') {
        temporaryBtn.classList.add('btn-income-selected');
        durationSection.style.display = 'block';
      } else {
        permanentBtn.classList.add('btn-income-selected');
        durationSection.style.display = 'none';
      }
    }

    function handleEditRecurringDescriptionInput(e) {
      const value = e.target.value.toLowerCase();
      const suggestionDiv = document.getElementById('editRecurringDescriptionSuggestion');
      
      if (!value) {
        suggestionDiv.classList.add('hidden');
        return;
      }

      const allDescriptions = new Set();
      transactions.forEach(t => allDescriptions.add(t.description));
      recurringTransactions.forEach(r => allDescriptions.add(r.description));

      const matches = Array.from(allDescriptions).filter(desc => 
        desc.toLowerCase().startsWith(value)
      );

      if (matches.length > 0 && matches[0] !== value) {
        document.getElementById('editRecurringSuggestionText').textContent = matches[0];
        suggestionDiv.classList.remove('hidden');
      } else {
        suggestionDiv.classList.add('hidden');
      }
    }

    function handleEditRecurringDescriptionKeydown(e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        const suggestionDiv = document.getElementById('editRecurringDescriptionSuggestion');
        if (!suggestionDiv.classList.contains('hidden')) {
          acceptEditRecurringSuggestion();
        }
      }
    }

    function acceptEditRecurringSuggestion() {
      const suggestionText = document.getElementById('editRecurringSuggestionText').textContent;
      document.getElementById('editRecurringDescription').value = suggestionText;
      document.getElementById('editRecurringDescriptionSuggestion').classList.add('hidden');
    }

    async function saveEditRecurring(e) {
      e.preventDefault();

      const submitBtn = e.target.querySelector('button[type="submit"]');
      if (submitBtn.disabled) return;

      submitBtn.disabled = true;
      const originalText = submitBtn.textContent;
      submitBtn.textContent = 'Salvando...';

      try {
        const recurringId = parseInt(document.getElementById('editRecurringId').value);
        const formData = new FormData(e.target);
        const type = formData.get('type');

        const durationMonthsValue = formData.get('duration_months');
        const durationMonths = durationMonthsValue && durationMonthsValue !== '' ? parseInt(durationMonthsValue) : null;

        let cardId = null;
        if (type === 'receita') {
          const cardIdIncome = formData.get('card_id_income');
          cardId = cardIdIncome && cardIdIncome !== '' ? parseInt(cardIdIncome) : null;
        } else {
          const cardIdExpense = formData.get('card_id');
          cardId = cardIdExpense && cardIdExpense !== '' ? parseInt(cardIdExpense) : null;
        }

        const updateData = {
          type: type,
          description: formData.get('description'),
          amount: parseFloat(formData.get('amount')),
          category: formData.get('category'),
          start_date: formData.get('start_date'),
          day_of_month: parseInt(formData.get('day_of_month')),
          duration_type: formData.get('duration_type'),
          duration_months: durationMonths
        };

        console.log('Updating recurring transaction:', { recurringId, userId: currentUser.id, updateData });

        const { error } = await supabaseClient
          .from('recurring_transactions')
          .update(updateData)
          .match({ id: recurringId, user_id: currentUser.id });

        if (error) {
          console.error('Error updating recurring transaction:', error);
          console.error('Error details:', { recurringId, currentUserId: currentUser?.id, error });
          showToast('Erro ao atualizar transação recorrente', 'error');
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
          return;
        }

        // Atualizar card mapping em localStorage
        if (cardId) {
          const cardMappings = JSON.parse(localStorage.getItem('recurring_card_mappings') || '{}');
          cardMappings[recurringId] = cardId;
          localStorage.setItem('recurring_card_mappings', JSON.stringify(cardMappings));
        }

        showToast('Transação recorrente atualizada com sucesso!', 'success');

        submitBtn.disabled = false;
        submitBtn.textContent = originalText;

        await loadData();
        updateUI();
        closeEditRecurringModal();
      } catch (error) {
        console.error('Error saving edit recurring transaction:', error);
        showToast('Erro ao atualizar transação recorrente. Tente novamente.', 'error');
        
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
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
      
      // Remove todas as classes de seleção de ambos
      btnPermanent.classList.remove('btn-permanent-selected', 'btn-temporary-selected');
      btnTemporary.classList.remove('btn-permanent-selected', 'btn-temporary-selected');
      
      if (durationType === 'permanent') {
        // Adicionar classe de seleção apenas ao permanente
        btnPermanent.classList.add('btn-permanent-selected');
        monthsSection.style.display = 'none';
      } else {
        // Adicionar classe de seleção apenas ao temporário
        btnTemporary.classList.add('btn-temporary-selected');
        monthsSection.style.display = 'block';
      }
    }

    function updateRecurringCategoryOptions() {
      const select = document.getElementById('recurringCategory');
      const type = document.getElementById('recurringType').value;
      
      const filteredCategories = categories.filter(c => c.type === type);

      select.innerHTML = filteredCategories.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    }

    function updateEditRecurringCategoryOptions() {
      const select = document.getElementById('editRecurringCategory');
      const type = document.getElementById('editRecurringType').value;
      
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

    function updateRecurringCardSelectionOptions() {
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

    function updateEditRecurringCardSelectionOptions() {
      const select = document.getElementById('editRecurringCardSelection');
      
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

    function updateEditRecurringCardOptions() {
      const select = document.getElementById('editRecurringCardSelectionIncome');
      
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
      const startDateStr = formData.get('start_date');
      const dayOfMonth = parseInt(formData.get('day_of_month'));
      
      const data = {
        type: type,
        description: description,
        amount: parseFloat(formData.get('amount')),
        category: formData.get('category'),
        day_of_month: dayOfMonth,
        duration_type: formData.get('duration_type'),
        duration_months: durationMonths,
        start_date: startDateStr,
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

        // Criar uma transação REAL imediatamente no mês da data de início
        // Independentemente do dia, vira transação real no mês de início
        const startDate = new Date(startDateStr + 'T00:00:00');
        const startMonth = startDate.getMonth();
        const startYear = startDate.getFullYear();
        
        // Criar transação na data especificada (day_of_month) do mês de início
        const transactionDate = new Date(startYear, startMonth, dayOfMonth);
        
        // Determinar payment_method baseado no cartão
        let paymentMethod = 'dinheiro';
        if (cardId) {
          const card = cards.find(c => c.id === cardId);
          if (card) {
            paymentMethod = card.type;
          }
        }
        
        const transactionData = {
          type: type,
          description: description,
          amount: parseFloat(formData.get('amount')),
          category: formData.get('category'),
          date: transactionDate.toISOString().split('T')[0],
          payment_method: paymentMethod,
          installments: 1,
          current_installment: 1,
          user_id: currentUser.id
        };
        
        if (cardId) {
          transactionData.card_id = cardId;
        }
        
        console.log('Criando transação real para recorrente:', transactionData);
        
        const { error: txError } = await supabaseClient.from('transactions').insert([transactionData]);
        if (txError) {
          console.warn('Aviso ao criar transação inicial da recorrente:', txError);
          // Não falha - continua mesmo sem criar a transação inicial
        }

        showToast('✅ Transação recorrente cadastrada com sucesso!', 'success');
        
        // Reabilitar botão após sucesso
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        
        await loadData();
        updateUI();
        closeRecurringModal();
      } catch (error) {
        console.error('Error saving recurring transaction:', error);
        showToast('❌ Erro ao cadastrar transação recorrente. Verifique os dados e tente novamente.', 'error');
        
        // Reabilitar botão em caso de erro
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    }

    async function deleteTransaction(transactionId, description, installments, currentInstallment) {
      // Converter para número se for uma string numérica
      const numId = isNaN(transactionId) ? transactionId : parseInt(transactionId);
      const transaction = transactions.find(t => t.id === numId);
      
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

    // Variáveis para autocomplete
    let touchStartX = 0;
    let allDescriptions = [];

    // Biblioteca padrão de descrições comuns
    const defaultDescriptions = [
      // Receitas
      'Salário',
      'Freelance',
      'Bônus',
      'Décimo terceiro',
      'Investimento',
      'Resgate de investimento',
      'Devoluções',
      'Reembolso',
      'Venda de item',
      'Presente em dinheiro',
      
      // Despesas - Alimentação
      'Alimentação',
      'Almoço',
      'Café',
      'Supermercado',
      'Padaria',
      'Restaurante',
      'Delivery',
      'Bar',
      'Lanche',
      'Lanches',
      
      // Despesas - Transporte
      'Transporte',
      'Uber',
      '99',
      'Táxi',
      'Combustível',
      'Gasolina',
      'Diesel',
      'Manutenção do carro',
      'Revisão do carro',
      'Seguro do carro',
      'Estacionamento',
      'Passagem aérea',
      'Passagem de ônibus',
      'Metrô',
      'Trem',
      
      // Despesas - Moradia
      'Aluguel',
      'Condomínio',
      'IPTU',
      'Luz',
      'Água',
      'Gás',
      'Internet',
      'Telefone',
      'Reparos da casa',
      'Móvel',
      'Decoração',
      
      // Despesas - Saúde
      'Farmácia',
      'Remédio',
      'Médico',
      'Dentista',
      'Academia',
      'Atividade física',
      'Seguro saúde',
      'Consulta',
      
      // Despesas - Educação
      'Educação',
      'Curso',
      'Livro',
      'Material escolar',
      'Mensalidade escolar',
      'Faculdade',
      'Workshop',
      
      // Despesas - Lazer
      'Cinema',
      'Teatro',
      'Show',
      'Passeio',
      'Viagem',
      'Hotel',
      'Diversão',
      'Jogo',
      'Hobby',
      
      // Despesas - Compras
      'Roupas',
      'Sapatos',
      'Bolsa',
      'Acessórios',
      'Eletrônico',
      'Presente',
      'Joias',
      
      // Despesas - Assinaturas
      'Netflix',
      'Spotify',
      'Prime Video',
      'Disney+',
      'Assinatura',
      'Streaming',
      'Software',
      'App',
      
      // Despesas - Contas e Serviços
      'Contas',
      'Conta de banco',
      'Taxa bancária',
      'Empréstimo',
      'Financiamento',
      'Juros',
      'Multa',
      
      // Despesas - Pessoal
      'Barbeiro',
      'Cabeleireiro',
      'Manicure',
      'Pedicure',
      'Cabelo',
      'Higiene pessoal',
      'Cosméticos',
      
      // Despesas - Outros
      'Diversos',
      'Ajuste',
      'Correção',
      'Doação',
      'Presente para alguém',
      'Diverso'
    ];

    function setTouchStartX(e) {
      touchStartX = e.touches[0].clientX;
    }

    function handleDescriptionKeydown(e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        acceptSuggestion();
      }
    }

    function handleDescriptionInput(e) {
      const input = e.target;
      const value = input.value.trim();
      const suggestionDiv = document.getElementById('descriptionSuggestion');
      const suggestionText = document.getElementById('suggestionText');

      if (value.length === 0) {
        suggestionDiv.classList.add('hidden');
        return;
      }

      // Buscar descrições (primeiro de transações anteriores, depois da biblioteca padrão)
      const suggestion = allDescriptions.find(desc => 
        desc.toLowerCase().startsWith(value.toLowerCase()) && desc.toLowerCase() !== value.toLowerCase()
      );

      if (suggestion) {
        // Mostrar sugestão
        suggestionText.textContent = suggestion;
        suggestionDiv.classList.remove('hidden');

        // Adicionar suporte a swipe à direita no mobile
        suggestionDiv.ontouchend = (touchEvent) => {
          const touchEndX = touchEvent.changedTouches[0].clientX;
          const diff = touchEndX - touchStartX;
          
          // Se deslizou mais de 50px para a direita, aceita
          if (diff > 50) {
            e.preventDefault();
            acceptSuggestion();
          }
        };
      } else {
        suggestionDiv.classList.add('hidden');
      }
    }

    function acceptSuggestion() {
      const input = document.getElementById('transactionDescription');
      const suggestionDiv = document.getElementById('descriptionSuggestion');
      const suggestionText = document.getElementById('suggestionText').textContent;

      if (suggestionText) {
        input.value = suggestionText;
        suggestionDiv.classList.add('hidden');
        input.focus();
      }
    }

    function buildDescriptionSuggestions() {
      // Coletar todas as descrições únicas de transações anteriores
      const userDescriptions = [...new Set(
        transactions
          .map(t => t.description)
          .filter(d => d && d.trim().length > 0)
      )];

      // Combinar com a biblioteca padrão (user descriptions têm prioridade)
      allDescriptions = [
        ...userDescriptions,
        ...defaultDescriptions.filter(d => !userDescriptions.some(ud => ud.toLowerCase() === d.toLowerCase()))
      ].sort();
    }

    function openTransactionModal() {
      buildDescriptionSuggestions();
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

    function openEditTransactionModal(transactionId) {
      buildDescriptionSuggestions();
      // Converter para número se for uma string numérica
      const numId = isNaN(transactionId) ? transactionId : parseInt(transactionId);
      const transaction = transactions.find(t => t.id === numId);
      
      if (!transaction) {
        showToast('Transação não encontrada.', 'error');
        return;
      }

      // Preencher os campos do formulário
      document.getElementById('editTransactionId').value = transactionId;
      document.getElementById('editTransactionType').value = transaction.type;
      document.getElementById('editTransactionDescription').value = transaction.description;
      document.getElementById('editTransactionAmount').value = transaction.amount;
      document.getElementById('editTransactionDate').value = transaction.date;

      // Atualizar o title do modal
      const modal = document.getElementById('editTransactionModal');
      const title = modal.querySelector('h3');
      title.textContent = 'Editar Transação';

      // Selecionar o tipo correto (isto popula o dropdown de categorias)
      selectEditTransactionType(transaction.type);
      
      // Agora atribuir a categoria após o dropdown estar preenchido
      document.getElementById('editTransactionCategory').value = transaction.category;
      
      // Mostrar o modal
      document.getElementById('editTransactionModal').classList.add('active');
    }

    function closeEditTransactionModal() {
      document.getElementById('editTransactionModal').classList.remove('active');
      document.getElementById('editTransactionForm').reset();
      const btnReceita = document.getElementById('editBtnReceita');
      const btnDespesa = document.getElementById('editBtnDespesa');
      if (btnReceita && btnDespesa) {
        selectEditTransactionType('receita');
      }
    }

    function selectEditTransactionType(type) {
      const btnReceita = document.getElementById('editBtnReceita');
      const btnDespesa = document.getElementById('editBtnDespesa');
      const hiddenInput = document.getElementById('editTransactionType');
      
      if (!btnReceita || !btnDespesa || !hiddenInput) {
        return;
      }
      
      hiddenInput.value = type;
      
      if (type === 'receita') {
        btnReceita.classList.add('btn-income-selected');
        btnReceita.classList.remove('btn-transaction-type');
        
        btnDespesa.classList.remove('btn-expense-selected');
        btnDespesa.classList.add('btn-transaction-type');
      } else {
        btnDespesa.classList.add('btn-expense-selected');
        btnDespesa.classList.remove('btn-transaction-type');
        
        btnReceita.classList.remove('btn-income-selected');
        btnReceita.classList.add('btn-transaction-type');
      }
      
      updateEditCategoryOptions();
    }

    function handleEditDescriptionInput(e) {
      const input = e.target;
      const value = input.value.trim();
      const suggestionDiv = document.getElementById('editDescriptionSuggestion');
      const suggestionText = document.getElementById('editSuggestionText');

      if (value.length === 0) {
        suggestionDiv.classList.add('hidden');
        return;
      }

      // Buscar descrições (primeiro de transações anteriores, depois da biblioteca padrão)
      const suggestion = allDescriptions.find(desc => 
        desc.toLowerCase().startsWith(value.toLowerCase()) && desc.toLowerCase() !== value.toLowerCase()
      );

      if (suggestion) {
        // Mostrar sugestão
        suggestionText.textContent = suggestion;
        suggestionDiv.classList.remove('hidden');

        // Adicionar suporte a swipe à direita no mobile
        suggestionDiv.ontouchend = (touchEvent) => {
          const touchEndX = touchEvent.changedTouches[0].clientX;
          const diff = touchEndX - touchStartX;
          
          // Se deslizou mais de 50px para a direita, aceita
          if (diff > 50) {
            e.preventDefault();
            acceptEditSuggestion();
          }
        };
      } else {
        suggestionDiv.classList.add('hidden');
      }
    }

    function handleEditDescriptionKeydown(e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        acceptEditSuggestion();
      }
    }

    function acceptEditSuggestion() {
      const input = document.getElementById('editTransactionDescription');
      const suggestionDiv = document.getElementById('editDescriptionSuggestion');
      const suggestionText = document.getElementById('editSuggestionText').textContent;

      if (suggestionText) {
        input.value = suggestionText;
        suggestionDiv.classList.add('hidden');
        input.focus();
      }
    }

    async function saveEditTransaction(e) {
      e.preventDefault();
      
      const submitBtn = e.target.querySelector('button[type="submit"]');
      if (submitBtn.disabled) return;
      
      submitBtn.disabled = true;
      const originalText = submitBtn.textContent;
      submitBtn.textContent = 'Salvando...';
      
      const transactionId = parseInt(document.getElementById('editTransactionId').value);
      const type = document.getElementById('editTransactionType').value;
      const description = document.getElementById('editTransactionDescription').value;
      const amount = parseFloat(document.getElementById('editTransactionAmount').value);
      const category = document.getElementById('editTransactionCategory').value;
      const date = document.getElementById('editTransactionDate').value;
      
      try {
        const { error } = await supabaseClient
          .from('transactions')
          .update({
            type: type,
            description: description,
            amount: amount,
            category: category,
            date: date
          })
          .eq('id', transactionId);
        
        if (error) throw error;

        showToast('Transação atualizada com sucesso!', 'success');
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        
        closeEditTransactionModal();
        await loadData();
        updateUI();
      } catch (error) {
        console.error('Error saving transaction:', error);
        showToast('Erro ao atualizar transação. Tente novamente.', 'error');
        
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    }

    function confirmDeleteEditingTransaction() {
      const transactionId = parseInt(document.getElementById('editTransactionId').value);
      const description = document.getElementById('editTransactionDescription').value;
      const amount = parseFloat(document.getElementById('editTransactionAmount').value);
      
      closeEditTransactionModal();
      deleteTransaction(transactionId, description, 1, 1);
    }

    function handleRecurringDescriptionInput(e) {
      const input = e.target;
      const value = input.value.trim();
      const suggestionDiv = document.getElementById('recurringDescriptionSuggestion');
      const suggestionText = document.getElementById('recurringSuggestionText');

      if (value.length === 0) {
        suggestionDiv.classList.add('hidden');
        return;
      }

      // Buscar descrições (primeiro de transações anteriores, depois da biblioteca padrão)
      const suggestion = allDescriptions.find(desc => 
        desc.toLowerCase().startsWith(value.toLowerCase()) && desc.toLowerCase() !== value.toLowerCase()
      );

      if (suggestion) {
        // Mostrar sugestão
        suggestionText.textContent = suggestion;
        suggestionDiv.classList.remove('hidden');

        // Adicionar suporte a swipe à direita no mobile
        suggestionDiv.ontouchend = (touchEvent) => {
          const touchEndX = touchEvent.changedTouches[0].clientX;
          const diff = touchEndX - touchStartX;
          
          // Se deslizou mais de 50px para a direita, aceita
          if (diff > 50) {
            e.preventDefault();
            acceptRecurringSuggestion();
          }
        };
      } else {
        suggestionDiv.classList.add('hidden');
      }
    }

    function handleRecurringDescriptionKeydown(e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        acceptRecurringSuggestion();
      }
    }

    function acceptRecurringSuggestion() {
      const input = document.getElementById('recurringDescription');
      const suggestionDiv = document.getElementById('recurringDescriptionSuggestion');
      const suggestionText = document.getElementById('recurringSuggestionText').textContent;

      if (suggestionText) {
        input.value = suggestionText;
        suggestionDiv.classList.add('hidden');
        input.focus();
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

    function updateEditCategoryOptions() {
      const select = document.getElementById('editTransactionCategory');
      const type = document.getElementById('editTransactionType').value;
      
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

        // Reabilitar botão após sucesso
        submitBtn.disabled = false;
        submitBtn.textContent = 'Salvar';
        
        closeTransactionModal();
        await loadData();
        updateUI();
      } catch (error) {
        console.error('Error saving transaction:', error);
        showToast('Erro ao cadastrar transação. Tente novamente.', 'error');
        
        // Reabilitar botão em caso de erro
        submitBtn.disabled = false;
        submitBtn.textContent = 'Salvar';
      }
    }

    function openCategoryModalFromTransaction() {
      openedFromModal = 'transaction';
      document.getElementById('categoryModal').classList.add('active');
      
      // Limpar o formulário de categoria
      document.getElementById('categoryForm').reset();
      
      // Definir para Despesa por padrão (vindo de transação de despesa)
      const transactionType = document.getElementById('transactionType').value;
      if (transactionType === 'receita') {
        document.getElementById('categoryType').value = 'receita';
      } else {
        document.getElementById('categoryType').value = 'despesa';
      }
    }

    function openCardModalFromTransaction() {
      openedFromModal = 'transaction';
      document.getElementById('cardModal').classList.add('active');
      
      // Limpar o formulário de cartão
      document.getElementById('cardForm').reset();
      toggleCreditCardFields();
    }

    function closeCategoryModalAndReturnToTransaction() {
      document.getElementById('categoryModal').classList.remove('active');
      document.getElementById('categoryForm').reset();
      updateCategoryOptions();
    }

    function closeCardModalAndReturnToTransaction() {
      document.getElementById('cardModal').classList.remove('active');
      document.getElementById('cardForm').reset();
      updateCardSelectionOptions();
      updateIncomeCardOptions();
    }

    function openCategoryModalFromRecurring() {
      openedFromModal = 'recurring';
      document.getElementById('categoryModal').classList.add('active');
      
      // Limpar o formulário de categoria
      document.getElementById('categoryForm').reset();
      
      // Definir para Despesa por padrão (vindo de transação de despesa)
      const recurringType = document.getElementById('recurringType').value;
      if (recurringType === 'receita') {
        document.getElementById('categoryType').value = 'receita';
      } else {
        document.getElementById('categoryType').value = 'despesa';
      }
    }

    function openCardModalFromRecurring() {
      openedFromModal = 'recurring';
      document.getElementById('cardModal').classList.add('active');
      
      // Limpar o formulário de cartão
      document.getElementById('cardForm').reset();
      toggleCreditCardFields();
    }

    function closeCategoryModalAndReturnToRecurring() {
      document.getElementById('categoryModal').classList.remove('active');
      document.getElementById('categoryForm').reset();
      updateRecurringCategoryOptions();
    }

    function closeCardModalAndReturnToRecurring() {
      document.getElementById('cardModal').classList.remove('active');
      document.getElementById('cardForm').reset();
      updateRecurringCardSelectionOptions();
      updateRecurringIncomeCardOptions();
    }

    function openCategoryModal() {
      document.getElementById('categoryModal').classList.add('active');
    }

    function openCardModal() {
      openedFromModal = null;
      document.getElementById('cardModal').classList.add('active');
      document.getElementById('cardForm').reset();
      toggleCreditCardFields();
    }

    function closeCardModal() {
      document.getElementById('cardModal').classList.remove('active');
      document.getElementById('cardForm').reset();
    }

    async function openEditCardModal(cardId) {
      const card = cards.find(c => c.id === cardId);
      if (!card) return;

      document.getElementById('editCardId').value = card.id;
      document.getElementById('editCardName').value = card.name;
      document.getElementById('editCardType').value = card.type;
      document.getElementById('editCardLast4').value = card.last_four || '';

      if (card.type === 'credito') {
        document.getElementById('editCardLimit').value = card.credit_limit || '';
        document.getElementById('editClosingDay').value = card.closing_day || '';
        document.getElementById('editDueDay').value = card.due_day || '';
        document.getElementById('editCreditCardFields').style.display = 'block';
      } else {
        document.getElementById('editCreditCardFields').style.display = 'none';
      }

      document.getElementById('editCardModal').classList.add('active');
    }

    function closeEditCardModal() {
      document.getElementById('editCardModal').classList.remove('active');
      document.getElementById('editCardForm').reset();
    }

    function toggleEditCreditCardFields() {
      const cardType = document.getElementById('editCardType').value;
      const creditCardFields = document.getElementById('editCreditCardFields');
      if (cardType === 'credito') {
        creditCardFields.style.display = 'block';
      } else {
        creditCardFields.style.display = 'none';
      }
    }

    async function saveEditCard(e) {
      e.preventDefault();

      const submitBtn = e.target.querySelector('button[type="submit"]');
      if (submitBtn.disabled) return;

      submitBtn.disabled = true;
      const originalText = submitBtn.textContent;
      submitBtn.textContent = 'Salvando...';

      try {
        const cardId = parseInt(document.getElementById('editCardId').value);
        const formData = new FormData(e.target);
        const cardType = formData.get('type');

        const updateData = {
          name: formData.get('name'),
          type: cardType,
          last_four: formData.get('last_four') || null
        };

        if (cardType === 'credito') {
          updateData.credit_limit = parseFloat(formData.get('credit_limit')) || null;
          updateData.closing_day = parseInt(formData.get('closing_day')) || null;
          updateData.due_day = parseInt(formData.get('due_day')) || null;
        }

        console.log('Updating card:', { cardId, userId: currentUser.id, updateData });

        const { error } = await supabaseClient
          .from('cards')
          .update(updateData)
          .match({ id: cardId, user_id: currentUser.id });

        if (error) {
          console.error('Error updating card:', error);
          console.error('Error details:', { cardId, currentUserId: currentUser?.id, error });
          showToast('Erro ao atualizar cartão', 'error');
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
          return;
        }

        showToast('Cartão atualizado com sucesso!', 'success');

        submitBtn.disabled = false;
        submitBtn.textContent = originalText;

        await loadData();
        updateUI();
        closeEditCardModal();
      } catch (error) {
        console.error('Error saving edit card:', error);
        showToast('Erro ao atualizar cartão. Tente novamente.', 'error');

        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
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
      const cardType = formData.get('type');
      
      const data = {
        name: formData.get('name'),
        type: cardType,
        last_four: formData.get('last_four'),
        credit_limit: formData.get('credit_limit') ? parseFloat(formData.get('credit_limit')) : null,
        closing_day: formData.get('closing_day') ? parseInt(formData.get('closing_day')) : null,
        due_day: formData.get('due_day') ? parseInt(formData.get('due_day')) : null,
        user_id: currentUser.id
      };

      try {
        const { data: insertedData, error } = await supabaseClient.from('cards').insert([data]).select();
        
        if (error) throw error;

        showToast('Cartão cadastrado com sucesso!', 'success');
        
        // Reabilitar botão após sucesso
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        
        await loadData();
        updateUI();
        
        // Se foi aberto de um modal, retornar para lá
        if (openedFromModal === 'transaction') {
          openedFromModal = null;
          closeCardModalAndReturnToTransaction();
        } else if (openedFromModal === 'recurring') {
          openedFromModal = null;
          closeCardModalAndReturnToRecurring();
        } else {
          closeCardModal();
        }
      } catch (error) {
        console.error('Error saving card:', error);
        showToast('Erro ao cadastrar cartão. Tente novamente.', 'error');
        
        // Reabilitar botão em caso de erro
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    }

    function openAddInitialInvoiceModal(cardId, cardName) {
      const confirmDiv = document.createElement('div');
      confirmDiv.className = 'modal active';
      confirmDiv.innerHTML = `
        <div class="modal-content max-w-2xl">
          <div class="flex items-center justify-between mb-6">
            <h3 class="text-2xl font-bold text-blue-500">➕ Adicionar Fatura ao ${cardName}</h3>
            <button onclick="this.closest('.modal').remove()" class="text-gray-400 hover:text-white text-2xl font-bold">✕</button>
          </div>

          <form onsubmit="saveInitialInvoice(event, ${cardId})" class="space-y-4">
            <div>
              <label class="block text-sm font-semibold mb-2">Descrição</label>
              <input type="text" name="description" placeholder="Ex: Fatura de dezembro" required class="w-full" />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-semibold mb-2">Valor</label>
                <input type="number" name="amount" placeholder="0,00" step="0.01" required class="w-full" />
              </div>
              <div>
                <label class="block text-sm font-semibold mb-2">Data</label>
                <input type="date" name="date" required class="w-full" />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-semibold mb-2">Parcelas</label>
                <input type="number" name="installments" value="1" min="1" class="w-full" />
              </div>
              <div>
                <label class="block text-sm font-semibold mb-2">Parcela Atual</label>
                <input type="number" name="current_installment" value="1" min="1" class="w-full" />
              </div>
            </div>

            <div>
              <label class="block text-sm font-semibold mb-2">Categoria</label>
              <select name="category" required class="w-full">
                <option value="">Selecione uma categoria</option>
                ${categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
              </select>
            </div>

            <div class="flex gap-3 pt-4">
              <button type="submit" class="btn-primary flex-1">✅ Adicionar Fatura</button>
              <button type="button" class="btn-secondary flex-1" onclick="this.closest('.modal').remove()">Cancelar</button>
            </div>
          </form>

          <div class="mt-6 p-4 bg-blue-500 bg-opacity-10 border border-blue-500 rounded-lg">
            <p class="text-sm text-blue-300">💡 <strong>Dica:</strong> Você pode adicionar múltiplas faturas clicando novamente no botão "Adicionar Faturas" após salvar cada uma.</p>
          </div>
        </div>
      `;
      document.body.appendChild(confirmDiv);
    }

    async function saveInitialInvoice(e, cardId) {
      e.preventDefault();

      const formData = new FormData(e.target);
      
      const data = {
        type: 'despesa',
        description: formData.get('description'),
        amount: parseFloat(formData.get('amount')),
        category: formData.get('category'),
        date: formData.get('date'),
        payment_method: 'credito',
        card_id: cardId,
        installments: parseInt(formData.get('installments')) || 1,
        current_installment: parseInt(formData.get('current_installment')) || 1,
        user_id: currentUser.id
      };

      try {
        console.log('Salvando fatura inicial:', data);

        const { error } = await supabaseClient.from('transactions').insert([data]);
        
        if (error) throw error;

        showToast(`✅ Fatura de ${formatCurrency(data.amount)} adicionada com sucesso!`, 'success');
        
        // Recarregar dados
        await loadData();
        updateUI();
        
        // Fechar o modal
        const modal = document.querySelector('.modal.active');
        if (modal) modal.remove();
        
        // Perguntar se quer adicionar outra
        const card = cards.find(c => c.id === cardId);
        const cardName = card ? card.name : 'Cartão';
        
        const confirmDiv = document.createElement('div');
        confirmDiv.className = 'modal active';
        confirmDiv.innerHTML = `
          <div class="modal-content max-w-md">
            <h3 class="text-xl font-bold mb-4 text-green-500">✅ Fatura Adicionada!</h3>
            <p class="text-gray-400 mb-6">Deseja adicionar outra fatura para <strong>${cardName}</strong>?</p>
            
            <div class="flex gap-3">
              <button class="btn-primary flex-1" onclick="openAddInitialInvoiceModal(${cardId}, '${cardName}'); this.closest('.modal').remove();">Adicionar Outra</button>
              <button class="btn-secondary flex-1" onclick="this.closest('.modal').remove();">Finalizar</button>
            </div>
          </div>
        `;
        document.body.appendChild(confirmDiv);
        
      } catch (error) {
        console.error('Error saving initial invoice:', error);
        showToast(`❌ Erro ao adicionar fatura: ${error.message}`, 'error');
      }
    }

    function openGoalModal() {
      document.getElementById('goalModal').classList.add('active');
    }

    function closeGoalModal() {
      document.getElementById('goalModal').classList.remove('active');
      document.getElementById('goalForm').reset();
    }

    async function openEditGoalModal(goalId) {
      const goal = goals.find(g => g.id === goalId);
      if (!goal) return;

      // Mapear número de prioridade de volta para texto
      const priorityNumToText = { 1: 'baixa', 2: 'media', 3: 'alta' };
      const priorityText = priorityNumToText[goal.priority] || 'media';

      document.getElementById('editGoalId').value = goal.id;
      document.getElementById('editGoalName').value = goal.name;
      document.getElementById('editGoalDescription').value = goal.description || '';
      document.getElementById('editGoalTarget').value = goal.target_amount;
      document.getElementById('editGoalCurrent').value = goal.current_amount;
      document.getElementById('editGoalDeadline').value = goal.deadline || '';
      document.getElementById('editGoalPriority').value = priorityText;

      document.getElementById('editGoalModal').classList.add('active');
    }

    function closeEditGoalModal() {
      document.getElementById('editGoalModal').classList.remove('active');
      document.getElementById('editGoalForm').reset();
    }

    async function saveEditGoal(e) {
      e.preventDefault();

      const submitBtn = e.target.querySelector('button[type="submit"]');
      if (submitBtn.disabled) return;

      submitBtn.disabled = true;
      const originalText = submitBtn.textContent;
      submitBtn.textContent = 'Salvando...';

      try {
        const goalId = parseInt(document.getElementById('editGoalId').value);
        const formData = new FormData(e.target);

        // Mapear prioridade de texto para número
        const priorityMap = { 'baixa': 1, 'media': 2, 'alta': 3 };
        const priorityValue = formData.get('priority') || 'media';

        const updateData = {
          name: formData.get('name'),
          target_amount: parseFloat(formData.get('target_amount')),
          current_amount: parseFloat(formData.get('current_amount')),
          deadline: formData.get('deadline') || null,
          priority: priorityMap[priorityValue] || 2
        };

        console.log('Updating goal:', { goalId, userId: currentUser.id, updateData });

        const { error } = await supabaseClient
          .from('goals')
          .update(updateData)
          .match({ id: goalId, user_id: currentUser.id });

        if (error) {
          console.error('Error updating goal:', error);
          console.error('Error details:', { goalId, currentUserId: currentUser?.id, error });
          showToast('Erro ao atualizar meta', 'error');
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
          return;
        }

        showToast('Meta atualizada com sucesso!', 'success');

        submitBtn.disabled = false;
        submitBtn.textContent = originalText;

        await loadData();
        updateUI();
        closeEditGoalModal();
      } catch (error) {
        console.error('Error saving edit goal:', error);
        showToast('Erro ao atualizar meta. Tente novamente.', 'error');

        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
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
      
      // Mapear prioridade de texto para número
      const priorityMap = { 'baixa': 1, 'media': 2, 'alta': 3 };
      const priorityValue = formData.get('priority') || 'media';
      
      const data = {
        name: formData.get('name'),
        target_amount: parseFloat(formData.get('target_amount')),
        current_amount: parseFloat(formData.get('current_amount')) || 0,
        deadline: formData.get('deadline') || null,
        priority: priorityMap[priorityValue] || 2,
        user_id: currentUser.id,
        created_at: new Date().toISOString()
      };

      try {
        const { error } = await supabaseClient.from('goals').insert([data]);
        
        if (error) throw error;

        showToast('Meta cadastrada com sucesso!', 'success');
        
        // Reabilitar botão após sucesso
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        
        await loadData();
        updateUI();
        closeGoalModal();
      } catch (error) {
        console.error('Error saving goal:', error);
        showToast('Erro ao cadastrar meta. Tente novamente.', 'error');
        
        // Reabilitar botão em caso de erro
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
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
      
      // Se foi aberto do modal de transação, retornar para lá
      if (openedFromTransaction) {
        document.getElementById('transactionModal').classList.add('active');
        openedFromTransaction = false;
      }
    }

    function openAdjustBalanceModal() {
      const balanceEl = document.getElementById('totalBalance');
      const currentBalance = parseFloat(balanceEl.dataset.value) || 0;
      
      document.getElementById('currentBalanceDisplay').textContent = formatCurrency(currentBalance);
      document.getElementById('adjustBalanceInput').value = currentBalance;
      document.getElementById('adjustBalanceModal').classList.add('active');
    }

    function closeAdjustBalanceModal() {
      document.getElementById('adjustBalanceModal').classList.remove('active');
      document.getElementById('adjustBalanceForm').reset();
    }

    async function saveAdjustBalance(e) {
      e.preventDefault();
      
      const submitBtn = e.target.querySelector('button[type="submit"]');
      if (submitBtn.disabled) return;
      
      submitBtn.disabled = true;
      const originalText = submitBtn.textContent;
      submitBtn.textContent = 'Ajustando...';
      
      const newBalance = parseFloat(document.getElementById('adjustBalanceInput').value);
      
      try {
        // Calcular saldo atual sem ajustes
        const currentCalculatedBalance = calculateRealBalance();
        const difference = newBalance - currentCalculatedBalance;
        
        console.log('Saldo calculado:', currentCalculatedBalance);
        console.log('Novo saldo desejado:', newBalance);
        console.log('Diferença:', difference);
        
        // Se há diferença, criar transação de ajuste
        if (Math.abs(difference) > 0.01) {
          const adjustmentTransaction = {
            user_id: currentUser.id,
            type: 'ajuste',
            description: `Ajuste de saldo: ${difference > 0 ? '+' : ''}${formatCurrency(difference)}`,
            amount: Math.abs(difference),
            category: 'Ajuste',
            date: new Date().toISOString().split('T')[0],
            payment_method: 'ajuste',
            installments: 1,
            current_installment: 1
          };
          
          console.log('Criando transação de ajuste:', adjustmentTransaction);
          
          const { data, error: insertError } = await supabaseClient.from('transactions').insert([adjustmentTransaction]).select();
          
          if (insertError) {
            console.error('Erro ao inserir ajuste:', insertError);
            throw insertError;
          }
          
          console.log('Transação de ajuste criada:', data);
        }
        
        showToast(`Saldo ajustado para ${formatCurrency(newBalance)}`, 'success');
        
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirmar';
        
        closeAdjustBalanceModal();
        currentViewDate = new Date();
        
        // Processar recorrências pendentes
        await processRecurringTransactions();
        
        await loadData();
        updateUI();
      } catch (error) {
        console.error('Error adjusting balance:', error);
        showToast('Erro ao ajustar saldo. Tente novamente.', 'error');
        
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    }

    // Calcular saldo baseado apenas em transações reais
    function calculateRealBalance() {
      const incomeTotal = transactions
        .filter(t => t.type === 'receita')
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);
      
      // Despesas que afetam saldo (não-crédito)
      const expenseTotal = transactions
        .filter(t => t.type === 'despesa' && t.payment_method !== 'credito')
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);
      
      // Ajustes
      const adjustmentTotal = transactions
        .filter(t => t.type === 'ajuste')
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);
      
      return incomeTotal - expenseTotal + adjustmentTotal;
    }

    // Processar recorrências e gerar transações reais
    async function processRecurringTransactions() {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      for (const recurring of recurringTransactions) {
        const startDate = new Date(recurring.start_date + 'T00:00:00');
        startDate.setHours(0, 0, 0, 0);
        
        // Não processar se ainda não começou
        if (startDate > today) continue;
        
        // Verificar duração se for temporária
        if (recurring.duration_type === 'temporary' && recurring.duration_months) {
          const expirationDate = new Date(startDate);
          expirationDate.setMonth(expirationDate.getMonth() + recurring.duration_months);
          if (today >= expirationDate) continue;
        }
        
        // Determinar ponto de partida
        let currentMonth, currentYear;
        
        if (recurring.last_generated_month !== null && recurring.last_generated_month !== undefined) {
          // Já foi processada antes, continuar do próximo mês
          currentMonth = recurring.last_generated_month;
          currentYear = recurring.last_generated_year;
          
          // Avançar para próximo mês
          currentMonth = (currentMonth + 1) % 12;
          if (currentMonth === 0) currentYear++;
        } else {
          // Primeira vez, começar do mês da data de início
          currentMonth = startDate.getMonth();
          currentYear = startDate.getFullYear();
        }
        
        // Processar até hoje
        while (new Date(currentYear, currentMonth, recurring.day_of_month) <= today) {
          const transactionDate = new Date(currentYear, currentMonth, recurring.day_of_month);
          
          // Só processar se a data de início já passou
          if (transactionDate < startDate) {
            // Avançar para próximo mês
            currentMonth = (currentMonth + 1) % 12;
            if (currentMonth === 0) currentYear++;
            continue;
          }
          
          const dateString = transactionDate.toISOString().split('T')[0];
          
          // Verificar se já existe transação desta recorrência neste mês
          const { data: existingInstances } = await supabaseClient
            .from('recurring_instances')
            .select('id')
            .match({
              user_id: currentUser.id,
              recurring_id: recurring.id,
              month: currentMonth,
              year: currentYear
            });
          
          if (!existingInstances || existingInstances.length === 0) {
            // Criar transação real
            const newTransaction = {
              user_id: currentUser.id,
              type: recurring.type,
              description: recurring.description,
              amount: parseFloat(recurring.amount),
              category: recurring.category,
              date: dateString,
              payment_method: recurring.payment_method || 'dinheiro',
              installments: 1,
              current_installment: 1
            };
            
            const { data: transactionData, error: transError } = await supabaseClient
              .from('transactions')
              .insert([newTransaction])
              .select();
            
            if (!transError && transactionData && transactionData.length > 0) {
              // Registrar instância de recorrência
              await supabaseClient.from('recurring_instances').insert([{
                user_id: currentUser.id,
                recurring_id: recurring.id,
                transaction_id: transactionData[0].id,
                month: currentMonth,
                year: currentYear
              }]);
              
              // Atualizar último mês processado
              await supabaseClient.from('recurring_transactions')
                .update({
                  last_generated_month: currentMonth,
                  last_generated_year: currentYear
                })
                .eq('id', recurring.id);
            }
          }
          
          // Próximo mês
          currentMonth = (currentMonth + 1) % 12;
          if (currentMonth === 0) currentYear++;
        }
      }
    }

    async function saveCategory(e) {
      e.preventDefault();
      
      const submitBtn = e.target.querySelector('button[type="submit"]');
      if (submitBtn.disabled) return;
      
      submitBtn.disabled = true;
      const originalText = submitBtn.textContent;
      submitBtn.textContent = 'Salvando...';
      
      const formData = new FormData(e.target);
      const categoryName = formData.get('name');
      const categoryType = formData.get('type');
      
      // Verificar se categoria já existe
      const existingCategory = categories.find(c => 
        c.name.toLowerCase() === categoryName.toLowerCase() && 
        c.type === categoryType
      );
      
      if (existingCategory) {
        showToast('Essa categoria já existe!', 'warning');
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        return;
      }
      
      const data = {
        name: categoryName,
        type: categoryType,
        user_id: currentUser.id
      };

      try {
        const { error } = await supabaseClient.from('categories').insert([data]);
        
        if (error) {
          // Verificar se é erro de duplicata
          if (error.code === '23505' || error.message?.includes('duplicate')) {
            showToast('Essa categoria já existe! Tente um nome diferente.', 'warning');
          } else {
            throw error;
          }
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
          return;
        }

        showToast('Categoria cadastrada com sucesso!', 'success');
        
        // Reabilitar botão após sucesso
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        
        await loadData();
        updateUI();
        
        // Se foi aberto de um modal, retornar para lá
        if (openedFromModal === 'transaction') {
          openedFromModal = null;
          closeCategoryModalAndReturnToTransaction();
        } else if (openedFromModal === 'recurring') {
          openedFromModal = null;
          closeCategoryModalAndReturnToRecurring();
        } else {
          closeCategoryModal();
        }
      } catch (error) {
        console.error('Error saving category:', error);
        showToast(`Erro ao cadastrar categoria: ${error.message || 'Tente novamente.'}`, 'error');
        
        // Reabilitar botão em caso de erro
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
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

    async function executeDeleteAllData() {
      try {
        // Deletar apenas dados do usuário logado
        await supabaseClient.from('transactions').delete().match({ user_id: currentUser.id });
        await supabaseClient.from('cards').delete().match({ user_id: currentUser.id });
        await supabaseClient.from('goals').delete().match({ user_id: currentUser.id });
        await supabaseClient.from('categories').delete().match({ user_id: currentUser.id });
        await supabaseClient.from('recurring_transactions').delete().match({ user_id: currentUser.id });

        // Redefinir estatísticas do usuário
        userStats = {
          level: 1,
          xp: 0,
          totalTransactions: 0
        };

        showToast('Sistema redefinido para o padrão inicial!', 'success');
        
        // Remover modal com segurança
        const modalElement = document.querySelector('.modal.active');
        if (modalElement) {
          modalElement.remove();
        }
        
        await loadData();
        updateUI();
      } catch (error) {
        console.error('Error deleting all data:', error);
        showToast('Erro ao redefinir sistema. Tente novamente.', 'error');
      }
    }

    function openAdjustInvoiceModal(cardId, currentAmount, cardName) {
      const confirmDiv = document.createElement('div');
      confirmDiv.className = 'modal active';
      confirmDiv.innerHTML = `
        <div class="modal-content max-w-md">
          <h3 class="text-xl font-bold mb-4 text-yellow-500">📝 Ajustar Fatura - ${cardName}</h3>
          
          <div class="bg-gray-800 bg-opacity-50 p-4 rounded-lg mb-4">
            <p class="text-xs text-gray-400 mb-2">Valor Atual</p>
            <p class="text-2xl font-bold text-yellow-400">${formatCurrency(currentAmount)}</p>
          </div>

          <form onsubmit="saveAdjustInvoice(event, ${cardId}, ${currentAmount})" class="space-y-4">
            <div>
              <label class="block text-sm font-semibold mb-2">Novo Valor</label>
              <input type="number" id="adjustedAmount" name="amount" placeholder="0,00" step="0.01" value="${currentAmount}" required class="w-full" />
            </div>

            <div class="text-sm text-gray-400 p-3 bg-gray-900 rounded-lg">
              <p class="mb-2">💡 Diferença: <span id="difference" class="font-bold text-yellow-400">${formatCurrency(0)}</span></p>
              <small>Se aumentar: será adicionado à fatura<br/>Se diminuir: será removido da fatura</small>
            </div>

            <div class="flex gap-3 pt-4">
              <button type="submit" class="btn-primary flex-1">✅ Salvar</button>
              <button type="button" class="btn-secondary flex-1" onclick="this.closest('.modal').remove()">Cancelar</button>
            </div>
          </form>
        </div>
      `;
      document.body.appendChild(confirmDiv);

      // Atualizar diferença em tempo real
      const input = confirmDiv.querySelector('#adjustedAmount');
      const diffEl = confirmDiv.querySelector('#difference');
      
      input.addEventListener('input', (e) => {
        const newAmount = parseFloat(e.target.value) || 0;
        const diff = newAmount - currentAmount;
        diffEl.textContent = formatCurrency(Math.abs(diff));
        diffEl.className = diff > 0 ? 'font-bold text-red-400' : diff < 0 ? 'font-bold text-green-400' : 'font-bold text-yellow-400';
      });
    }

    async function saveAdjustInvoice(e, cardId, currentAmount) {
      e.preventDefault();

      const newAmount = parseFloat(document.getElementById('adjustedAmount').value) || 0;
      const difference = newAmount - currentAmount;

      if (difference === 0) {
        showToast('⚠️ Nenhuma alteração no valor da fatura', 'error');
        return;
      }

      const card = cards.find(c => c.id === cardId);
      if (!card) {
        showToast('❌ Cartão não encontrado', 'error');
        return;
      }

      const now = new Date();

      try {
        // Criar transação de ajuste da fatura
        const adjustmentData = {
          type: 'despesa',
          description: difference > 0 
            ? `Ajuste Fatura ${card.name} (+${formatCurrency(difference)})`
            : `Ajuste Fatura ${card.name} (${formatCurrency(difference)})`,
          amount: Math.abs(difference),
          category: 'Contas',
          date: now.toISOString().split('T')[0],
          payment_method: difference > 0 ? 'credito' : 'ajuste',
          card_id: difference > 0 ? cardId : null,
          installments: 1,
          current_installment: 1,
          user_id: currentUser.id
        };

        console.log('Salvando ajuste de fatura:', adjustmentData);

        const { error } = await supabaseClient.from('transactions').insert([adjustmentData]);
        
        if (error) throw error;

        showToast(`✅ Fatura ajustada para ${formatCurrency(newAmount)}`, 'success');
        
        // Fechar modal
        const modal = document.querySelector('.modal.active');
        if (modal) modal.remove();
        
        // Recarregar dados
        await loadData();
        updateUI();
        
      } catch (error) {
        console.error('Error adjusting invoice:', error);
        showToast(`❌ Erro ao ajustar fatura: ${error.message}`, 'error');
      }
    }

    function payCardInvoice(cardId, amount, period) {
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
        if (!card) {
          showToast('❌ Cartão não encontrado!', 'error');
          return;
        }

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        
        // Registrar pagamento da fatura como RECEITA negativa (débito)
        // Isso vai reduzir o saldo da conta de débito, sem deletar as transações de crédito
        const data = {
          type: 'despesa',
          description: `Pagamento Fatura - ${card.name}`,
          amount: amount,
          category: 'Contas',
          date: now.toISOString().split('T')[0],
          payment_method: paymentSourceCardId ? 'debito' : 'dinheiro',
          installments: 1,
          current_installment: 1,
          user_id: currentUser.id
        };

        // Adicionar card_id apenas se foi selecionado um cartão de débito
        if (paymentSourceCardId) {
          data.card_id = paymentSourceCardId;
        }

        console.log('Enviando pagamento de fatura:', data);

        const { data: insertedData, error } = await supabaseClient.from('transactions').insert([data]).select();
        
        if (error) {
          console.error('Erro ao inserir transação:', error);
          throw error;
        }

        console.log('Transação inserida com sucesso:', insertedData);
        
        showToast(`✅ Pagamento de ${formatCurrency(amount)} registrado com sucesso!`, 'success');
        
        // Fechar modal
        const modal = document.querySelector('.modal.active');
        if (modal) modal.remove();
        
        // Recarregar dados
        console.log('Recarregando dados...');
        await loadData();
        console.log('Dados recarregados. Atualizando UI...');
        updateUI();
        console.log('UI atualizada.');
        
      } catch (error) {
        console.error('Error paying invoice:', error);
        showToast(`❌ Erro ao registrar pagamento: ${error.message}`, 'error');
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
      // Verificar se o usuário é admin antes de permitir mudança de tema
      if (!isCurrentUserAdmin) {
        showToast('Apenas administradores podem usar o Modo Turbo.', 'error');
        return;
      }
      
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
      document.body.style.color = '#1f2937';

      // Sidebar - Clean light gray with blue accent
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) {
        sidebar.style.background = '#f9fafb';
        sidebar.style.borderRight = '2px solid #e5e7eb';
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

      // Month selector (roleta) - Light gray with blue accent
      document.querySelectorAll('.month-selector').forEach(el => {
        el.style.background = '#f3f4f6';
        el.style.borderColor = '#d1d5db';
        el.style.color = '#1f2937';
      });

      // Month label text - Vibrant blue
      document.querySelectorAll('.month-label').forEach(label => {
        label.style.color = '#2563eb';
        label.style.fontWeight = '600';
      });

      // Stat cards - Light background with subtle shadow
      document.querySelectorAll('.stat-card').forEach(card => {
        card.style.background = '#f9fafb';
        card.style.borderColor = '#e5e7eb';
        card.style.color = '#1f2937';
        card.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)';
        card.style.borderWidth = '1px';
      });

      // Stat card headings - DARK TEXT
      document.querySelectorAll('.stat-card h3, .stat-card h4').forEach(heading => {
        heading.style.color = '#111827';
        heading.style.fontWeight = '700';
      });

      // Stat card text - DARK TEXT
      document.querySelectorAll('.stat-card p, .stat-card span').forEach(text => {
        text.style.color = '#374151';
      });

      // Chart containers
      document.querySelectorAll('.chart-container').forEach(container => {
        container.style.background = '#f9fafb';
        container.style.borderColor = '#e5e7eb';
        container.style.color = '#1f2937';
      });

      // Chart text - DARK TEXT
      document.querySelectorAll('.chart-container span, .chart-container p').forEach(text => {
        text.style.color = '#374151';
      });

      // Transaction items
      document.querySelectorAll('.transaction-item').forEach(item => {
        item.style.background = '#f9fafb';
        item.style.borderColor = '#e5e7eb';
        item.style.color = '#1f2937';
      });

      // Transaction item text - DARK TEXT
      document.querySelectorAll('.transaction-item span, .transaction-item p').forEach(text => {
        text.style.color = '#374151';
      });

      // Projected transaction items - Light blue tint
      document.querySelectorAll('.transaction-item.projected').forEach(item => {
        item.style.background = '#eff6ff';
        item.style.borderColor = '#bfdbfe';
        item.style.color = '#1f2937';
      });

      // Inputs - Clean white with gray border
      document.querySelectorAll('input, select, textarea').forEach(input => {
        input.style.background = '#ffffff';
        input.style.borderColor = '#d1d5db';
        input.style.color = '#1f2937';
        input.style.transition = 'all 0.3s ease';
        input.style.borderWidth = '1px';
      });

      // Input focus states - Blue highlight
      document.querySelectorAll('input, select, textarea').forEach(input => {
        input.onfocus = function() {
          this.style.borderColor = '#2563eb';
          this.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.1)';
          this.style.background = '#ffffff';
        };
        input.onblur = function() {
          this.style.borderColor = '#d1d5db';
          this.style.boxShadow = 'none';
        };
      });

      // Modal - White background with professional shadow
      document.querySelectorAll('.modal-content').forEach(modal => {
        modal.style.background = '#ffffff';
        modal.style.color = '#1f2937';
        modal.style.boxShadow = '0 20px 25px rgba(0, 0, 0, 0.1), 0 10px 10px rgba(0, 0, 0, 0.04)';
        modal.style.borderRadius = '12px';
      });

      // Modal backdrop - Subtle dark overlay
      document.querySelectorAll('.modal').forEach(modalBg => {
        modalBg.style.background = 'rgba(0, 0, 0, 0.25)';
      });

      // Progress bar - Light gray background, blue fill
      document.querySelectorAll('.progress-bar').forEach(bar => {
        bar.style.background = '#e5e7eb';
        const fill = bar.querySelector('.progress-fill') || bar.querySelector('div');
        if (fill) {
          fill.style.background = 'linear-gradient(90deg, #2563eb 0%, #0ea5e9 100%)';
        }
      });

      // Primary buttons - Bold blue gradient
      document.querySelectorAll('.btn-primary').forEach(btn => {
        btn.style.background = 'linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%)';
        btn.style.color = '#ffffff';
        btn.style.border = 'none';
        btn.style.boxShadow = '0 4px 6px rgba(37, 99, 235, 0.3)';
        btn.style.fontWeight = '600';
      });

      // Secondary buttons - Light gray background
      document.querySelectorAll('.btn-secondary').forEach(btn => {
        btn.style.background = '#f3f4f6';
        btn.style.color = '#1f2937';
        btn.style.borderColor = '#d1d5db';
        btn.style.border = '1px solid #d1d5db';
        btn.style.fontWeight = '500';
      });

      // Calculator buttons
      document.querySelectorAll('.calc-btn').forEach(btn => {
        btn.style.background = '#f3f4f6';
        btn.style.color = '#1f2937';
        btn.style.border = '1px solid #d1d5db';
        btn.style.fontWeight = '500';
      });

      document.querySelectorAll('.calc-btn-operator').forEach(btn => {
        btn.style.background = '#eff6ff';
        btn.style.color = '#2563eb';
        btn.style.border = '1px solid #bfdbfe';
        btn.style.fontWeight = '600';
      });

      document.querySelectorAll('.calc-btn-clear').forEach(btn => {
        btn.style.background = '#fef2f2';
        btn.style.color = '#dc2626';
        btn.style.border = '1px solid #fecaca';
        btn.style.fontWeight = '600';
      });

      document.querySelectorAll('.calc-btn-equals, .calc-btn-send').forEach(btn => {
        btn.style.background = 'linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%)';
        btn.style.color = '#ffffff';
        btn.style.border = 'none';
        btn.style.fontWeight = '600';
      });

      // Danger buttons - Light red
      document.querySelectorAll('button').forEach(btn => {
        if (btn.textContent.includes('Deletar') || btn.textContent.includes('Remover') || btn.classList.contains('btn-danger')) {
          btn.style.background = '#fef2f2';
          btn.style.color = '#dc2626';
          btn.style.borderColor = '#fecaca';
          btn.style.border = '1px solid #fecaca';
          btn.style.fontWeight = '600';
        }
      });

      // Success/Payment buttons - Light green
      document.querySelectorAll('button').forEach(btn => {
        if (btn.textContent.includes('Pagar') || btn.textContent.includes('Confirmar') || btn.classList.contains('btn-success')) {
          btn.style.background = '#f0fdf4';
          btn.style.color = '#16a34a';
          btn.style.borderColor = '#86efac';
          btn.style.border = '1px solid #86efac';
          btn.style.fontWeight = '600';
        }
      });

      // Text colors - Professional dark gray
      document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(heading => {
        heading.style.color = '#111827';
        heading.style.fontWeight = '700';
      });

      // Secondary text - Medium gray
      document.querySelectorAll('.text-gray-400, .text-gray-500').forEach(text => {
        text.style.color = '#6b7280';
      });

      // Achievement badges styling
      document.querySelectorAll('.achievement').forEach(achievement => {
        achievement.style.background = '#f9fafb';
        achievement.style.borderColor = '#e5e7eb';
        achievement.style.color = '#1f2937';
        
        const unlocked = achievement.classList.contains('unlocked');
        if (unlocked) {
          achievement.style.borderColor = '#2563eb';
          achievement.style.background = 'linear-gradient(135deg, rgba(37, 99, 235, 0.08), transparent)';
        }
      });

      // Achievement headings - DARK TEXT
      document.querySelectorAll('.achievement h4, .achievement h3').forEach(heading => {
        heading.style.color = '#111827';
        heading.style.fontWeight = '700';
      });

      // Achievement text - DARK TEXT
      document.querySelectorAll('.achievement p, .achievement span').forEach(text => {
        text.style.color = '#374151';
      });

      // Category items styling
      document.querySelectorAll('.category-item').forEach(item => {
        item.style.background = '#f9fafb';
        item.style.borderColor = '#e5e7eb';
        item.style.color = '#1f2937';
      });

      // Category item text - DARK TEXT
      document.querySelectorAll('.category-item h4, .category-item span').forEach(text => {
        text.style.color = '#111827';
        text.style.fontWeight = '600';
      });

      // Transaction type buttons - Light default
      document.querySelectorAll('.btn-transaction-type, .btn-recurring-type, .btn-duration').forEach(btn => {
        btn.style.background = '';
        btn.style.borderColor = '';
        btn.style.color = '';
        btn.style.fontWeight = '';
      });

      // Income/Permanent selected buttons - Blue
      document.querySelectorAll('.btn-income-selected, .btn-permanent-selected').forEach(btn => {
        btn.style.background = '';
        btn.style.borderColor = '';
        btn.style.color = '';
        btn.style.fontWeight = '';
      });

      // Expense/Temporary selected buttons - Red
      document.querySelectorAll('.btn-expense-selected, .btn-temporary-selected').forEach(btn => {
        btn.style.background = '';
        btn.style.borderColor = '';
        btn.style.color = '';
        btn.style.fontWeight = '';
      });

      // Installment simulation box
      document.querySelectorAll('.installment-simulation-box').forEach(box => {
        box.style.background = 'rgba(37, 99, 235, 0.08)';
        box.style.borderColor = '#2563eb';
      });

      // Installment title
      document.querySelectorAll('.installment-title').forEach(title => {
        title.style.color = '#2563eb';
        title.style.fontWeight = '700';
      });

      // Installment label
      document.querySelectorAll('.installment-label').forEach(label => {
        label.style.color = '#6b7280';
      });

      // Installment checkbox
      document.querySelectorAll('.installment-checkbox').forEach(checkbox => {
        checkbox.style.accentColor = '#2563eb';
      });

      // Sidebar items styling - DARK TEXT for light background
      document.querySelectorAll('.sidebar-item').forEach(item => {
        item.style.color = '#374151';
        item.style.borderLeftColor = 'transparent';
        item.style.fontWeight = '500';
      });

      // Active sidebar item - darker text
      document.querySelectorAll('.sidebar-item.active').forEach(item => {
        item.style.color = '#1f2937';
        item.style.fontWeight = '700';
        item.style.borderLeftColor = '#2563eb';
      });

      // Credit and debit card visuals - DARK TEXT
      document.querySelectorAll('.credit-card-visual, .card-visual, [class*="card-visual"]').forEach(card => {
        card.style.background = 'linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)';
        card.style.borderColor = '#e5e7eb';
        card.style.color = '#111827';
      });

      // Card text labels - DARK TEXT
      document.querySelectorAll('.credit-card-visual span, .card-visual span').forEach(span => {
        span.style.color = '#1f2937';
      });

      // Tables, lists, and transaction containers
      document.querySelectorAll('table, tr, td, [class*="transaction"], [class*="list"]').forEach(el => {
        if (el.style) {
          const currentBg = el.style.background;
          if (currentBg && (currentBg.includes('#1a1a1a') || currentBg.includes('#0a0a0a') || currentBg.includes('dark'))) {
            el.style.background = '#ffffff';
            el.style.color = '#1f2937';
          }
        }
      });

      // SVG icons color - ENSURE DARK STROKES
      document.querySelectorAll('svg').forEach(svg => {
        const stroke = svg.getAttribute('stroke');
        const color = svg.getAttribute('color');
        
        // Skip if it has specific colors (green/red for income/expense)
        if (stroke === '#10b981' || stroke === '#ef4444' || color === '#10b981' || color === '#ef4444') {
          return;
        }
        
        // Change light colors to dark
        if (stroke === '#888' || stroke === '#e5e5e5' || stroke === '#888888') {
          svg.setAttribute('stroke', '#4b5563');
        }
        if (stroke === 'currentColor') {
          // Keep currentColor for inherited styling
        }
        if (!color || color === '#888' || color === '#e5e5e5' || color === '#888888') {
          svg.setAttribute('color', '#4b5563');
        }
      });

      // Category and achievement SVG icons - DARK COLORS
      document.querySelectorAll('.category-item svg, .achievement svg').forEach(svg => {
        const stroke = svg.getAttribute('stroke');
        const color = svg.getAttribute('color');
        
        if (stroke === '#10b981' || stroke === '#ef4444') {
          return; // Keep income/expense colors
        }
        if (stroke === '#888' || stroke === '#e5e5e5' || stroke === '#888888') {
          svg.setAttribute('stroke', '#374151');
        }
        if (!color || color === '#888' || color === '#e5e5e5') {
          svg.setAttribute('color', '#374151');
        }
      });

      // Border colors - update dark borders to light
      document.querySelectorAll('[class*="border"]').forEach(el => {
        if (el.style && el.style.borderColor) {
          const borderColor = el.style.borderColor;
          if (borderColor === '#2a2a2a' || borderColor === '#1a1a1a' || borderColor === '#0a0a0a') {
            el.style.borderColor = '#e5e7eb';
          }
        }
      });

      // Span and small text elements - DARK TEXT
      document.querySelectorAll('span').forEach(span => {
        if (span.style && span.style.color === '#e5e5e5' || span.style.color === '#888888') {
          span.style.color = '#374151';
        }
      });

      // Badges com fundo verde/amarelo escuro - WHITE TEXT
      document.querySelectorAll('[class*="bg-green"], [class*="bg-yellow"]').forEach(el => {
        const classes = el.className;
        // Se tem classe de fundo verde-900 ou amarelo-900, garante texto branco
        if ((classes.includes('bg-green-9') || classes.includes('bg-yellow-9')) && !classes.includes('text-white')) {
          el.style.color = '#ffffff';
        }
      });

      // Labels - DARK TEXT
      document.querySelectorAll('label').forEach(label => {
        label.style.color = '#1f2937';
        label.style.fontWeight = '500';
      });

      // Paragraphs - DARK TEXT
      document.querySelectorAll('p').forEach(p => {
        if (!p.style.color || p.style.color === '#e5e5e5') {
          p.style.color = '#374151';
        }
      });

      // Link colors - BLUE
      document.querySelectorAll('a').forEach(link => {
        link.style.color = '#2563eb';
      });

      // Income and expenses colors - always green and red
      const monthIncomeEl = document.getElementById('monthIncome');
      if (monthIncomeEl) {
        monthIncomeEl.style.color = '#10b981';
      }
      
      const monthExpensesEl = document.getElementById('monthExpenses');
      if (monthExpensesEl) {
        monthExpensesEl.style.color = '#ef4444';
      }

      // Total balance - dynamic color based on value
      const totalBalanceEl = document.getElementById('totalBalance');
      if (totalBalanceEl) {
        // Will be updated by renderDashboard function, no override here
      }

      // XP circle mini styling
      const xpCircleMini = document.getElementById('xpCircleMini');
      if (xpCircleMini) {
        xpCircleMini.style.stroke = 'url(#gradientMini)';
      }

      // Back to current button styling
      document.querySelectorAll('#backToCurrentBtn, #backToCurrentBtn2').forEach(btn => {
        btn.style.background = 'linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%)';
        btn.style.color = '#ffffff';
        btn.style.border = 'none';
        btn.style.fontWeight = '600';
      });

      // Profile avatar circle
      document.querySelectorAll('[style*="from-green"]').forEach(el => {
        el.style.background = 'linear-gradient(to bottom right, #2563eb, #0ea5e9)';
      });

      // Achievement badges - light backgrounds with dark text
      document.querySelectorAll('[class*="achievement"], [class*="badge"]').forEach(el => {
        if (el.style.background && el.style.background.includes('dark')) {
          el.style.background = '#f9fafb';
          el.style.borderColor = '#e5e7eb';
          el.style.color = '#1f2937';
        }
      });

      // Form validation messages - DARK TEXT
      document.querySelectorAll('.error-message, .success-message, [class*="message"]').forEach(msg => {
        msg.style.color = '#dc2626';
      });

      // Tooltip and popover text - DARK TEXT
      document.querySelectorAll('[role="tooltip"], [class*="tooltip"], [class*="popover"]').forEach(el => {
        el.style.color = '#1f2937';
      });

      // Card titles in sidebar - DARK TEXT
      document.querySelectorAll('.card-title, .section-title').forEach(el => {
        el.style.color = '#111827';
        el.style.fontWeight = '700';
      });

      // Stats and numbers - DARK TEXT
      document.querySelectorAll('[class*="stat"], [class*="value"], [class*="amount"]').forEach(el => {
        el.style.color = '#1f2937';
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
        btn.style.background = '';
        btn.style.borderColor = '';
        btn.style.color = '';
      });

      // Income/Permanent selected - Green
      document.querySelectorAll('.btn-income-selected, .btn-permanent-selected').forEach(btn => {
        btn.style.background = '';
        btn.style.borderColor = '';
        btn.style.color = '';
      });

      // Expense/Temporary selected - Red
      document.querySelectorAll('.btn-expense-selected, .btn-temporary-selected').forEach(btn => {
        btn.style.background = '';
        btn.style.borderColor = '';
        btn.style.color = '';
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

      // Income and expenses colors - always green and red
      const monthIncomeEl = document.getElementById('monthIncome');
      if (monthIncomeEl) {
        monthIncomeEl.style.color = '#10b981';
      }
      
      const monthExpensesEl = document.getElementById('monthExpenses');
      if (monthExpensesEl) {
        monthExpensesEl.style.color = '#ef4444';
      }

      // Profile avatar - Green gradient
      document.querySelectorAll('[class*="from-green"]').forEach(el => {
        el.style.background = 'linear-gradient(to bottom right, #10b981, #059669)';
      });
    }

    // ===== FUNÇÕES DE CONFIGURAÇÕES =====

    function updateSettingsPage() {
      try {
        if (currentUser) {
          // Username
          const usernameEl = document.getElementById('settingsUsername');
          if (usernameEl) {
            const savedName = localStorage.getItem(`userName_${currentUser.id}`) || 
                            currentUser.user_metadata?.name || 
                            currentUser.email?.split('@')[0] || 
                            'Usuário';
            usernameEl.value = savedName;
          }
          
          // Preferências
          const prefs = JSON.parse(localStorage.getItem('userPreferences') || '{}');
          const projEl = document.getElementById('showProjections');
          const notifEl = document.getElementById('notifications');
          const autoSaveEl = document.getElementById('autoSave');
          
          if (projEl) projEl.checked = prefs.showProjections !== false;
          if (notifEl) notifEl.checked = prefs.notifications !== false;
          if (autoSaveEl) autoSaveEl.checked = prefs.autoSave !== false;
          
          // Estatísticas
          document.getElementById('statsTransactions').textContent = transactions.length;
          document.getElementById('statsCards').textContent = cards.length;
          document.getElementById('statsGoals').textContent = goals.length;
          document.getElementById('statsRecurring').textContent = recurringTransactions.length;
        }
      } catch (error) {
        console.error('Erro ao atualizar página de configurações:', error);
      }
    }

    function updateUserProfile() {
      try {
        const newName = document.getElementById('settingsUsername').value || 'Usuário';
        
        if (!newName.trim()) {
          showToast('Nome não pode estar vazio', 'warning');
          return;
        }
        
        // Salvar no localStorage com ID do usuário
        localStorage.setItem(`userName_${currentUser.id}`, newName);
        
        showToast('✓ Perfil atualizado com sucesso!', 'success');
        
        // Atualizar nome no perfil do menu
        updateUserProfileName();
        
        updateSettingsPage();
      } catch (error) {
        console.error('Erro ao atualizar perfil:', error);
        showToast('Erro ao salvar perfil', 'error');
      }
    }

    function savePreference(key, value) {
      try {
        const preferences = JSON.parse(localStorage.getItem('userPreferences') || '{}');
        preferences[key] = value;
        localStorage.setItem('userPreferences', JSON.stringify(preferences));
        
        const labels = {
          'showProjections': 'Projeções',
          'notifications': 'Notificações',
          'autoSave': 'Auto-save'
        };
        
        showToast(`✓ ${labels[key]} ${value ? 'ativado' : 'desativado'}`, 'success');
      } catch (error) {
        console.error('Erro ao salvar preferência:', error);
      }
    }

    function exportData() {
      try {
        const currentBalance = calculateRealBalance();
        
        const dataToExport = {
          exportDate: new Date().toISOString(),
          user: {
            id: currentUser.id,
            email: currentUser.email,
            name: localStorage.getItem(`userName_${currentUser.id}`) || 'Usuário'
          },
          data: {
            transactions: transactions.map(t => ({
              ...t,
              date: new Date(t.date).toLocaleDateString('pt-BR')
            })),
            cards: cards,
            goals: goals,
            recurringTransactions: recurringTransactions,
            categories: categories
          },
          summary: {
            exportedAt: new Date().toLocaleString('pt-BR'),
            totalTransactions: transactions.length,
            totalCards: cards.length,
            totalGoals: goals.length,
            totalRecurring: recurringTransactions.length,
            currentBalance: currentBalance,
            formattedBalance: formatCurrency(currentBalance)
          }
        };

        const dataString = JSON.stringify(dataToExport, null, 2);
        const dataBlob = new Blob([dataString], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `finance-flow-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        showToast('✓ Dados exportados com sucesso!', 'success');
      } catch (error) {
        console.error('Erro ao exportar dados:', error);
        showToast('Erro ao exportar dados', 'error');
      }
    }

    function changePassword() {
      const modal = document.createElement('div');
      modal.className = 'modal active';
      modal.innerHTML = `
        <div class="modal-content max-w-md">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-2xl font-bold">🔑 Redefinir Senha</h3>
            <button onclick="this.closest('.modal').remove()" class="text-gray-400 hover:text-white">
              <svg width="24" height="24" viewbox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
            </button>
          </div>
          <div class="space-y-4">
            <p class="text-gray-300">Um email de redefinição de senha será enviado para:</p>
            <p class="text-blue-400 font-semibold">${currentUser.email}</p>
            <button class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors" onclick="sendPasswordResetEmail('${currentUser.email}')">
              Enviar Email de Redefinição
            </button>
            <p class="text-xs text-gray-500 text-center">Verifique sua caixa de spam se não receber em alguns minutos</p>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
      };
    }

    async function sendPasswordResetEmail(email) {
      try {
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}?reset=true`
        });
        
        if (error) throw error;
        
        showToast('✓ Email de redefinição enviado! Verifique sua caixa de entrada', 'success');
        document.querySelector('.modal.active')?.remove();
      } catch (error) {
        console.error('Erro ao enviar email:', error);
        showToast('Erro ao enviar email de redefinição', 'error');
      }
    }

    async function logout() {
      if (confirm('Tem certeza que deseja sair da sua conta?')) {
        try {
          const { error } = await supabaseClient.auth.signOut();
          
          if (error) throw error;
          
          currentUser = null;
          transactions = [];
          cards = [];
          goals = [];
          recurringTransactions = [];
          categories = [];
          
          localStorage.removeItem('currentUser');
          localStorage.removeItem('manualBalanceAdjustments');
          
          document.getElementById('dashboardPage').classList.remove('active');
          document.getElementById('authPage').classList.add('active');
          
          showToast('✓ Você saiu com sucesso!', 'success');
        } catch (error) {
          console.error('Erro ao fazer logout:', error);
          showToast('Erro ao sair da conta', 'error');
        }
      }
    }

    function confirmDeleteAllData() {
      const modal = document.createElement('div');
      modal.className = 'modal active';
      modal.innerHTML = `
        <div class="modal-content max-w-md">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-2xl font-bold text-red-500">⚠️ Apagar TUDO?</h3>
            <button onclick="this.closest('.modal').remove()" class="text-gray-400 hover:text-white">
              <svg width="24" height="24" viewbox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
            </button>
          </div>
          <div class="space-y-4 mb-4">
            <div class="bg-red-900 bg-opacity-30 border border-red-600 rounded-lg p-3">
              <p class="text-red-300 text-sm">Esta ação é IRREVERSÍVEL! Todos os seus dados serão permanentemente deletados.</p>
            </div>
            <p class="text-gray-400 text-sm">Isso inclui:</p>
            <ul class="text-xs text-gray-500 space-y-1 ml-4">
              <li>✗ ${transactions.length} transações</li>
              <li>✗ ${cards.length} cartões</li>
              <li>✗ ${goals.length} metas</li>
              <li>✗ ${recurringTransactions.length} recorrências</li>
            </ul>
          </div>
          <div class="space-y-3">
            <input type="text" placeholder="Digite 'DELETAR' para confirmar" id="confirmDeleteInput" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:border-red-500 focus:outline-none">
            <div class="flex gap-3">
              <button class="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors" onclick="this.closest('.modal').remove()">
                Cancelar
              </button>
              <button class="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors" onclick="deleteAllDataConfirmed(this)">
                Deletar
              </button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
      };
    }

    async function deleteAllDataConfirmed(button) {
      const input = document.getElementById('confirmDeleteInput');
      if (input.value.toUpperCase() !== 'DELETAR') {
        showToast('Digite "DELETAR" para confirmar', 'warning');
        return;
      }
      
      button.disabled = true;
      button.textContent = 'Deletando...';
      
      try {
        await executeDeleteAllData();
      } catch (error) {
        console.error('Erro ao deletar dados:', error);
        button.disabled = false;
        button.textContent = 'Deletar';
      }
    }

    // Initialize app
    init();
    initTheme();